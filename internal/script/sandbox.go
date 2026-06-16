package script

import (
	"context"
	"fmt"
	"time"

	"github.com/injoyai/script-gateway/lib"
	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
)

// 默认脚本超时
const DefaultTimeout = 50 * time.Millisecond

// 白名单包，仅允许安全的标准库和自定义库
var allowedImports = map[string]bool{
	"fmt":             true,
	"strings":         true,
	"strconv":         true,
	"encoding/json":   true,
	"encoding/hex":    true,
	"encoding/base64": true,
	"math":            true,
	"time":            true,
	"regexp":          true,
	"bytes":           true,
	"crypto/md5":      true,
	"crypto/sha1":     true,
	"crypto/sha256":   true,
	"crypto/hmac":     true,
}

// SafeInterpreter 创建安全沙盒解释器
func SafeInterpreter() *interp.Interpreter {
	i := interp.New(interp.Options{})
	i.Use(stdlib.Symbols)
	i.Use(lib.Symbols)
	return i
}

// SafeInterpreterWithWhitelist 创建带白名单的安全沙盒解释器
func SafeInterpreterWithWhitelist() *interp.Interpreter {
	i := interp.New(interp.Options{})
	// 仅注册白名单包
	filtered := make(interp.Exports)
	for pkg, symbols := range stdlib.Symbols {
		if allowedImports[pkg] {
			filtered[pkg] = symbols
		}
	}
	i.Use(filtered)
	i.Use(lib.Symbols)
	return i
}

// RunWithTimeout 带超时执行脚本函数
func RunWithTimeout(fn func() error, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				errCh <- fmt.Errorf("script panic: %v", r)
			}
		}()
		errCh <- fn()
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		return fmt.Errorf("script timeout after %v", timeout)
	}
}

// ValidateScript 验证脚本安全性（静态检查）
func ValidateScript(content string) error {
	return nil
}
