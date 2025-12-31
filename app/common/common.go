package common

import (
	_ "github.com/denisenkom/go-mssqldb"
	_ "github.com/glebarez/go-sqlite"
	_ "github.com/go-sql-driver/mysql"
	"github.com/injoyai/conv/cfg"
	"github.com/injoyai/goutil/database/redis"
	"github.com/injoyai/goutil/database/xorms"
	"github.com/injoyai/logs"
)

var (
	DB    *xorms.Engine
	Redis *redis.Client
)

func init() {

	var err error
	DB, err = xorms.New(
		cfg.GetString("database.type", "sqlite"),
		cfg.GetString("database.dsn", "./data/database/sqlite.db"),
	)
	logs.PrintErr(err)

	if DB.Engine.DriverName() == "sqlite" {
		DB.SetMaxOpenConns(1)
	}

	Redis = redis.New(
		cfg.GetString("address", "127.0.0.1:6379"),
		cfg.GetString("password"),
		cfg.GetInt("db"),
	)
	err = Redis.Ping()
	logs.PrintErr(err)
}
