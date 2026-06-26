package listen

import (
	"context"
	"fmt"
	"io"
	"sync/atomic"

	"github.com/injoyai/script-gateway/internal/script"
)

var _ Listener = (*ScriptListener_)(nil)

func NewScriptListener(content string, topic string) *ScriptListener_ {
	return &ScriptListener_{
		content: content,
		topic:   topic,
	}
}

// ScriptListener_ 脚本监听器
//
// 用户脚本采用顶级函数 + 包级变量单例模式：
//   - Run()         error          启用：初始化资源（建连接/开端口），阻塞直到 Close
//   - Close()       error          禁用：释放资源，使 Run 自然返回
//   - Read()        ([]byte, error) 入站：阻塞读取一条数据
//   - Write(p)      error          出站：可选，缺失则静默丢弃
//
// 状态通过包级变量持有，每个 script_conn 实例对应独立 yaegi 解释器，天然隔离。
// 框架在 Start 时 Eval 取函数并类型断言为具体 func 类型缓存，调用路径零反射开销。
type ScriptListener_ struct {
	content string
	topic   string
	closed  atomic.Bool
	ctx     context.Context
	cancel  context.CancelFunc

	// 用户脚本顶级函数（Start 时类型断言缓存，调用零反射）
	runFn   func() error
	closeFn func() error
	readFn  func() ([]byte, error)
	writeFn func([]byte) error  // 可选，nil 表示用户未实现

	// ReadMessage 用
	msgCh chan []byte
}

func (this *ScriptListener_) Start(ctx context.Context) error {
	this.closed.Store(false)
	this.msgCh = make(chan []byte, 100)

	i := script.SafeInterpreter()
	if _, err := i.Eval(this.content); err != nil {
		return fmt.Errorf("脚本编译失败: %w", err)
	}

	// Run（启用）必须：func() error，阻塞直到 Close
	if v, err := i.Eval("Run"); err != nil {
		return fmt.Errorf("脚本必须定义 Run 函数: %w", err)
	} else {
		fn, ok := v.Interface().(func() error)
		if !ok {
			return fmt.Errorf("Run 签名应为 func() error, got %T", v.Interface())
		}
		this.runFn = fn
	}

	// Close（禁用）必须：func() error，释放资源使 Run 自然返回
	if v, err := i.Eval("Close"); err != nil {
		return fmt.Errorf("脚本必须定义 Close 函数: %w", err)
	} else {
		fn, ok := v.Interface().(func() error)
		if !ok {
			return fmt.Errorf("Close 签名应为 func() error, got %T", v.Interface())
		}
		this.closeFn = fn
	}

	// Read（入站）必须：func() ([]byte, error)
	if v, err := i.Eval("Read"); err != nil {
		return fmt.Errorf("脚本必须定义 Read 函数: %w", err)
	} else {
		fn, ok := v.Interface().(func() ([]byte, error))
		if !ok {
			return fmt.Errorf("Read 签名应为 func() ([]byte, error), got %T", v.Interface())
		}
		this.readFn = fn
	}

	// Write（出站）可选
	if v, err := i.Eval("Write"); err == nil {
		if fn, ok := v.Interface().(func([]byte) error); ok {
			this.writeFn = fn
		}
	}

	this.ctx, this.cancel = context.WithCancel(ctx)

	// 启动 Run goroutine（阻塞，Close 使其自然返回）
	go func() {
		defer func() { _ = recover() }()
		this.runFn()
	}()

	// 启动 Read goroutine，循环调用 Read 推入 msgCh
	go this.readLoop()

	return nil
}

func (this *ScriptListener_) readLoop() {
	for {
		select {
		case <-this.ctx.Done():
			return
		default:
		}
		data, err := this.safeRead()
		if err != nil {
			// Read panic 或返回错误，跳过本次继续
			continue
		}
		if len(data) == 0 {
			continue
		}
		select {
		case this.msgCh <- data:
		case <-this.ctx.Done():
			return
		}
	}
}

// safeRead 安全调用 readFn，recover panic
func (this *ScriptListener_) safeRead() (data []byte, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("Read panic: %v", r)
		}
	}()
	return this.readFn()
}

func (this *ScriptListener_) ReadMessage() ([]byte, error) {
	select {
	case data, ok := <-this.msgCh:
		if !ok {
			return nil, io.EOF
		}
		return data, nil
	case <-this.ctx.Done():
		return nil, io.EOF
	}
}

func (this *ScriptListener_) Write(p []byte) (int, error) {
	if this.writeFn == nil {
		// 用户未实现 Write，静默丢弃出站
		return len(p), nil
	}
	var err error
	func() {
		defer func() {
			if r := recover(); r != nil {
				err = fmt.Errorf("Write panic: %v", r)
			}
		}()
		err = this.writeFn(p)
	}()
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

func (this *ScriptListener_) Closed() bool {
	return this.closed.Load()
}

func (this *ScriptListener_) Close() error {
	this.closed.Store(true)
	if this.cancel != nil {
		this.cancel()
	}
	// 调用用户 Close（让用户释放资源）
	if this.closeFn != nil {
		defer func() { _ = recover() }()
		this.closeFn()
	}
	return nil
}
