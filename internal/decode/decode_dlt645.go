package decode

import (
	"fmt"

	"github.com/injoyai/script-gateway/internal/types"
)

var _ Processor = (*DLT645)(nil)

type DLT645 struct{}

func (this *DLT645) Process(msg *types.Message) (*types.Message, error) {
	// TODO: 实现 DLT645 协议解析
	return msg, fmt.Errorf("DLT645 processor not implemented")
}

func (this *DLT645) Key() string  { return "dlt645" }
func (this *DLT645) Name() string { return "DLT645协议" }
