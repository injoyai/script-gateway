package bar

import (
	"context"
	"time"

	"github.com/injoyai/bar"
)

const (
	Name    = "Bar"
	Version = "v1.0"
)

func Run(ctx context.Context) error {
	x := bar.New(
		bar.WithTotal(60),
		bar.WithFormatDefault(func(p *bar.Plan) {
			p.SetStyle("■")
			p.SetPadding(".")
		}),
	)
	defer x.Close()
	for {
		time.Sleep(time.Millisecond * 30)
		x.Add(1)
		if x.Flush() {
			break
		}
	}
	return nil
}
