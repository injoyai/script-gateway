package main

import (
	"github.com/injoyai/script-gateway/app/route"

	"github.com/injoyai/logs"
)

func main() {
	logs.Err(route.Run())
}
