package listen

import (
	"context"
	"io"
)

// Listener 统一监听器接口
// 借鉴 github.com/injoyai/ios 的 IO 接口设计：
// - Start: 启动监听（建立连接、绑定端口等）
// - ReadMessage: 读取一条消息（阻塞直到有数据或关闭）
// - io.Writer: 写入数据到连接（出站）
// - io.Closer: 关闭监听器
//
// 生命周期：Start → 循环 ReadMessage → Close
// pipeline 统一管理读循环，监听器只负责"怎么读/写一条消息"
type Listener interface {
	// Start 启动监听器（建立连接、绑定端口等初始化工作）
	Start(ctx context.Context) error

	// ReadMessage 读取一条消息，阻塞直到有数据或关闭
	// 返回 nil, nil 表示本次无数据（继续循环）
	// 返回 nil, io.EOF 表示连接关闭
	ReadMessage() ([]byte, error)

	// io.Writer 写入数据到连接（出站）
	io.Writer

	// io.Closer 关闭监听器
	io.Closer

	// Closed 获取监听状态
	Closed() bool
}
