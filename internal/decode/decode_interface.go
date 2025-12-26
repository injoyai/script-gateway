package decode

type Decoder interface {
	Decode([]byte) (map[string]any, error)
}

type Info struct {
	Key  string
	Name string
}

func All() []*Info {
	return []*Info{
		{Key: "dlt645", Name: "DLT645协议"},
		{Key: "modbus_rtu", Name: "Modbus RTU协议"},
		{Key: "modbus_tcp", Name: "Modbus TCP协议"},
		{Key: "script", Name: "自定义协议"},
		{Key: "pass", Name: "忽略"},
	}
}
