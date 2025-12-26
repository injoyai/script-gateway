package register

import "github.com/injoyai/base/maps"

type Register struct {
	m *maps.Generic[string, *maps.Safe]
}

func (this *Register) Set(group, key string, value any) {
	m := this.m.GetOrSetByHandler2(group, func() *maps.Safe { return maps.NewSafe() })
	m.Set(key, value)
}

func (this *Register) OnChange(f func()) {

}
