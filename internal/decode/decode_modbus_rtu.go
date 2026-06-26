package decode

import (
	"fmt"

	"github.com/injoyai/script-gateway/internal/types"
)

var _ Processor = (*ModbusRTU)(nil)

type ModbusRTU struct{}

func (this *ModbusRTU) Process(msg *types.Message) ([]*types.Message, error) {
	// TODO: 实现 Modbus RTU 协议解析
	return nil, fmt.Errorf("ModbusRTU processor not implemented")
}

func (this *ModbusRTU) Key() string  { return "modbus_rtu" }
func (this *ModbusRTU) Name() string { return "Modbus RTU协议" }
