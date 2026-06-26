package api

import (
	"context"
	"io"
	"os/exec"
	"runtime"
	"time"

	"github.com/fasthttp/websocket"
	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/logs"
)

// Ssh SSH/本地终端 API
type Ssh struct{}

// Connect 建立 WebSocket 连接，启动本地 shell 会话
// 路由: GET /api/ssh/connect
func (*Ssh) Connect(c fbr.Ctx) {
	// 使用 fbr 框架提供的默认 upgrader（CheckOrigin 始终返回 true）
	err := fbr.DefaultUpgrader.Upgrade(c.RequestCtx(), func(conn *websocket.Conn) {
		defer conn.Close()

		// 选择 shell
		shell, args := selectShell()

		// 启动子进程
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		cmd := exec.CommandContext(ctx, shell, args...)
		cmd.Env = nil // 继承当前环境变量

		stdin, err := cmd.StdinPipe()
		if err != nil {
			conn.WriteMessage(websocket.TextMessage, []byte("\r\n无法获取 stdin: "+err.Error()+"\r\n"))
			return
		}
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			conn.WriteMessage(websocket.TextMessage, []byte("\r\n无法获取 stdout: "+err.Error()+"\r\n"))
			return
		}
		stderr, err := cmd.StderrPipe()
		if err != nil {
			conn.WriteMessage(websocket.TextMessage, []byte("\r\n无法获取 stderr: "+err.Error()+"\r\n"))
			return
		}

		if err := cmd.Start(); err != nil {
			conn.WriteMessage(websocket.TextMessage, []byte("\r\n启动 shell 失败: "+err.Error()+"\r\n"))
			return
		}

		conn.WriteMessage(websocket.TextMessage, []byte("\r\n本地 shell 会话已建立\r\n"))

		// stdout -> websocket
		go func() {
			buf := make([]byte, 4096)
			for {
				n, err := stdout.Read(buf)
				if n > 0 {
					if werr := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); werr != nil {
						return
					}
				}
				if err != nil {
					if err != io.EOF {
						logs.Errorf("读取 stdout 失败: %v", err)
					}
					return
				}
			}
		}()

		// stderr -> websocket
		go func() {
			buf := make([]byte, 4096)
			for {
				n, err := stderr.Read(buf)
				if n > 0 {
					if werr := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); werr != nil {
						return
					}
				}
				if err != nil {
					if err != io.EOF {
						logs.Errorf("读取 stderr 失败: %v", err)
					}
					return
				}
			}
		}()

		// websocket -> stdin
		go func() {
			defer func() {
				cancel()
				stdin.Close()
			}()
			for {
				_, data, err := conn.ReadMessage()
				if err != nil {
					return
				}
				if _, err := stdin.Write(data); err != nil {
					return
				}
			}
		}()

		// 等待进程退出
		waitErr := cmd.Wait()
		if waitErr != nil {
			// 进程异常退出（非 nil）时通知前端
			_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\n\r\n[会话结束]\r\n"))
		} else {
			_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\n\r\n[会话已退出]\r\n"))
		}

		// 给前端一点时间收到最后一条消息
		time.Sleep(100 * time.Millisecond)
		_ = conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	})
	if err != nil {
		logs.Errorf("SSH WebSocket 升级失败: %v", err)
	}
}

// selectShell 根据操作系统选择合适的 shell
func selectShell() (string, []string) {
	if runtime.GOOS == "windows" {
		// Windows 使用 PowerShell，支持 ANSI 颜色
		return "powershell.exe", []string{"-NoLogo", "-NoExit"}
	}
	// Linux/macOS 优先使用 bash，其次 sh
	for _, sh := range []string{"bash", "sh"} {
		if path, err := exec.LookPath(sh); err == nil {
			return path, []string{"-i"} // 交互模式
		}
	}
	return "/bin/sh", []string{"-i"}
}
