package listen

import (
	"context"
	"fmt"
	"io"
	"reflect"
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

type ScriptListener_ struct {
	content string
	topic   string
	closed  atomic.Bool
	ctx     context.Context
	cancel  context.CancelFunc

	// 用户对象实例（reflect.Value，指针类型）
	obj reflect.Value

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

	// 取 New 工厂函数
	v, err := i.Eval("New")
	if err != nil {
		return fmt.Errorf("脚本必须定义 New 函数（返回对象实例）: %w", err)
	}

	// reflect 调用 New() 拿对象实例
	results := v.Call(nil)
	if len(results) != 1 {
		return fmt.Errorf("New 函数应返回 1 个值, got %d", len(results))
	}
	this.obj = results[0]
	if this.obj.Kind() != reflect.Ptr {
		return fmt.Errorf("New 应返回指针类型, got %s", this.obj.Kind())
	}

	this.ctx, this.cancel = context.WithCancel(ctx)

	// 取 Run 函数字段
	runField := this.obj.Elem().FieldByName("Run")
	if !runField.IsValid() || runField.IsNil() {
		return fmt.Errorf("对象必须定义 Run func(context.Context) error 字段")
	}

	// 启动 Run goroutine（阻塞，ctx 取消返回）
	go func() {
		defer func() { _ = recover() }()
		runField.Call([]reflect.Value{reflect.ValueOf(this.ctx)})
	}()

	// 启动 Read goroutine，循环调用 obj.Read 推入 msgCh
	go this.readLoop()

	return nil
}

func (this *ScriptListener_) readLoop() {
	readField := this.obj.Elem().FieldByName("Read")
	// Read 字段缺失或为 nil，readLoop 直接退出
	if !readField.IsValid() || readField.IsNil() {
		return
	}
	ctxVal := reflect.ValueOf(this.ctx)
	for {
		select {
		case <-this.ctx.Done():
			return
		default:
		}
		results, err := this.safeCall(readField, []reflect.Value{ctxVal})
		if err != nil {
			// Read panic，跳过本次继续
			continue
		}
		if len(results) < 1 {
			continue
		}
		data := this.extractBytes(results[0])
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

// extractBytes 从 reflect.Value 提取 []byte（yaegi 映射为 []uint8）
func (this *ScriptListener_) extractBytes(v reflect.Value) []byte {
	if !v.IsValid() {
		return nil
	}
	if v.Kind() == reflect.Interface {
		v = v.Elem()
	}
	if v.Kind() == reflect.Slice && v.Type().Elem().Kind() == reflect.Uint8 {
		return v.Bytes()
	}
	return nil
}

// safeCall 安全调用 reflect.Value，recover panic
func (this *ScriptListener_) safeCall(fn reflect.Value, args []reflect.Value) (results []reflect.Value, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("脚本方法调用 panic: %v", r)
		}
	}()
	return fn.Call(args), nil
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
	if !this.obj.IsValid() {
		return len(p), nil
	}
	writeField := this.obj.Elem().FieldByName("Write")
	if !writeField.IsValid() || writeField.IsNil() {
		// 用户未实现 Write，静默丢弃出站
		return len(p), nil
	}
	_, err := this.safeCall(writeField, []reflect.Value{reflect.ValueOf(p)})
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
	// 调用用户对象的 Close 字段（存在则调，让用户释放资源）
	if this.obj.IsValid() {
		closeField := this.obj.Elem().FieldByName("Close")
		if closeField.IsValid() && !closeField.IsNil() {
			defer func() { _ = recover() }()
			closeField.Call(nil)
		}
	}
	return nil
}
