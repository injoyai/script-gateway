package lib

import (
	_ "github.com/injoyai/bar"
	_ "github.com/injoyai/base/chans"
	_ "github.com/injoyai/conv"
	_ "github.com/injoyai/frame/fbr"
	_ "github.com/injoyai/ios/v2"
	_ "github.com/injoyai/ios/v2/module/mqtt"
	_ "github.com/injoyai/ios/v2/module/serial"
	_ "github.com/injoyai/ios/v2/module/ssh"
	_ "github.com/injoyai/logs"
	_ "github.com/injoyai/logs/v2"
	"github.com/traefik/yaegi/interp"
)

var Symbols = interp.Exports{}

///go:generate go install github.com/traefik/yaegi/cmd/yaegi@latest

//go:generate yaegi extract github.com/injoyai/ios/v2
//go:generate yaegi extract github.com/injoyai/ios/v2/client
//go:generate yaegi extract github.com/injoyai/ios/v2/client/dial
//go:generate yaegi extract github.com/injoyai/ios/v2/client/frame
//go:generate yaegi extract github.com/injoyai/ios/v2/client/redial
//go:generate yaegi extract github.com/injoyai/ios/v2/module/common
//go:generate yaegi extract github.com/injoyai/ios/v2/module/memory
//go:generate yaegi extract github.com/injoyai/ios/v2/module/mqtt
//go:generate yaegi extract github.com/injoyai/ios/v2/module/serial
//go:generate yaegi extract github.com/injoyai/ios/v2/module/sse
//go:generate yaegi extract github.com/injoyai/ios/v2/module/ssh
//go:generate yaegi extract github.com/injoyai/ios/v2/module/tcp
//go:generate yaegi extract github.com/injoyai/ios/v2/module/udp
//go:generate yaegi extract github.com/injoyai/ios/v2/module/unix
//go:generate yaegi extract github.com/injoyai/ios/v2/module/websocket
//go:generate yaegi extract github.com/injoyai/ios/v2/server
//go:generate yaegi extract github.com/injoyai/ios/v2/server/listen
//go:generate yaegi extract github.com/injoyai/ios/v2/split

//go:generate yaegi extract github.com/injoyai/conv
//go:generate yaegi extract github.com/injoyai/conv/cfg
//go:generate yaegi extract github.com/injoyai/conv/codec
//go:generate yaegi extract github.com/injoyai/conv/codec/ini
//go:generate yaegi extract github.com/injoyai/conv/codec/json
//go:generate yaegi extract github.com/injoyai/conv/codec/toml
//go:generate yaegi extract github.com/injoyai/conv/codec/xml
//go:generate yaegi extract github.com/injoyai/conv/codec/yaml
//
//go:generate yaegi extract github.com/injoyai/base/chans
//go:generate yaegi extract github.com/injoyai/base/coding
//go:generate yaegi extract github.com/injoyai/base/coding/json
//go:generate yaegi extract github.com/injoyai/base/crypt
//go:generate yaegi extract github.com/injoyai/base/crypt/aes
//go:generate yaegi extract github.com/injoyai/base/crypt/crc
//go:generate yaegi extract github.com/injoyai/base/crypt/des
//go:generate yaegi extract github.com/injoyai/base/crypt/gzip
//go:generate yaegi extract github.com/injoyai/base/crypt/md5
//go:generate yaegi extract github.com/injoyai/base/crypt/sha
//go:generate yaegi extract github.com/injoyai/base/crypt/tls
//go:generate yaegi extract github.com/injoyai/base/maps
//go:generate yaegi extract github.com/injoyai/base/maps/timeout
//go:generate yaegi extract github.com/injoyai/base/maps/wait
//go:generate yaegi extract github.com/injoyai/base/safe
//go:generate yaegi extract github.com/injoyai/base/str
//go:generate yaegi extract github.com/injoyai/base/types
//
//go:generate yaegi extract github.com/injoyai/frame
//go:generate yaegi extract github.com/injoyai/frame/fbr
//go:generate yaegi extract github.com/injoyai/frame/gins
//go:generate yaegi extract github.com/injoyai/frame/middle/easy_user
//go:generate yaegi extract github.com/injoyai/frame/middle/in
//go:generate yaegi extract github.com/injoyai/frame/middle/swagger
//
//go:generate yaegi extract github.com/injoyai/logs
//go:generate yaegi extract github.com/injoyai/logs/v2
//go:generate yaegi extract github.com/injoyai/bar
