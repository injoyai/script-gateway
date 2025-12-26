package main

import (
	"script-gateway/app/route"

	"github.com/injoyai/logs"
)

func main() {
	logs.Err(route.Run())
}
