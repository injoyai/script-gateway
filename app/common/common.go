package common

import (
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/denisenkom/go-mssqldb"
	_ "github.com/glebarez/go-sqlite"
	_ "github.com/go-sql-driver/mysql"
	"github.com/injoyai/conv/cfg"
	"github.com/injoyai/goutil/database/redis"
	"github.com/injoyai/goutil/database/xorms"
	"github.com/injoyai/logs"
	"github.com/injoyai/script-gateway/app/model"
	"xorm.io/xorm"
)

var (
	DB    *xorms.Engine
	Redis *redis.Client
)

func init() {
	databaseType := cfg.GetString("database.type", "sqlite")
	dsn := cfg.GetString("database.dsn", "./data/database/sqlite.db")
	databaseOption := func(engine *xorm.Engine) {}

	switch databaseType {
	case "sqlite":
		os.MkdirAll(filepath.Dir(dsn), 0755)
		databaseOption = func(engine *xorm.Engine) { engine.SetMaxOpenConns(1) }
	}

	var err error
	DB, err = xorms.New(
		cfg.GetString("database.type", "sqlite"),
		dsn,
		databaseOption,
	)
	logs.PrintErr(err)
	ensureSchema(databaseType)

	Redis = redis.New(
		cfg.GetString("address", "127.0.0.1:6379"),
		cfg.GetString("password"),
		cfg.GetInt("db"),
	)
	err = Redis.Ping()
	logs.PrintErr(err)
}

// 旧表名（xorm 默认 PascalCase）到新表名（snake_case）的映射
var legacyTableRenames = map[string]string{
	"User":             "user",
	"ListenerParent":   "listener_parent",
	"ListenerConn":     "listener_conn",
	"DispatcherConfig": "dispatcher_config",
	"ProcessorChain":   "processor_chain",
	"OperationLog":     "operation_log",
	"ConfigSnapshot":   "config_snapshot",
	"Metric":           "metric",
	"Script":           "script",
	"ListenHTTP":       "listen_http",
	"ListenerConfig":   "listener_config",
}

// 旧列名（PascalCase）到新列名（snake_case）的映射
var legacyColumnRenames = map[string]map[string]string{
	"user": {
		"ID": "id", "Username": "username", "Password": "password", "Role": "role",
		"LastLoginAt": "last_login_at", "CreatedAt": "created_at", "UpdatedAt": "updated_at",
	},
	"listener_parent": {
		"ID": "id", "Name": "name", "Type": "type", "Enable": "enable",
		"Config": "config", "CreatedAt": "created_at", "UpdatedAt": "updated_at",
	},
	"listener_conn": {
		"ID": "id", "ParentID": "parent_id", "Name": "name", "Type": "type",
		"Enable": "enable", "Topic": "topic", "OutTopic": "out_topic", "Config": "config",
		"PreScript": "pre_script", "CreatedAt": "created_at", "UpdatedAt": "updated_at",
	},
	"dispatcher_config": {
		"ID": "id", "Name": "name", "Type": "type", "Enable": "enable",
		"Topics": "topics", "Config": "config", "CreatedAt": "created_at", "UpdatedAt": "updated_at",
	},
	"processor_chain": {
		"ID": "id", "Name": "name", "Topic": "topic", "Processors": "processors",
		"Enable": "enable", "CreatedAt": "created_at", "UpdatedAt": "updated_at",
	},
	"operation_log": {
		"ID": "id", "UserID": "user_id", "Username": "username", "Action": "action",
		"Resource": "resource", "ResourceID": "resource_id", "Detail": "detail",
		"IP": "ip", "CreatedAt": "created_at",
	},
	"config_snapshot": {
		"ID": "id", "Name": "name", "Data": "data", "CreatedBy": "created_by", "CreatedAt": "created_at",
	},
	"metric": {
		"ID": "id", "Name": "name", "Type": "type", "Value": "value",
		"Labels": "labels", "Timestamp": "timestamp",
	},
	"script": {
		"Key": "key", "Name": "name", "Version": "version", "Type": "type", "Script": "script",
	},
	"listen_http": {
		"ID": "id", "Name": "name", "Port": "port", "Enable": "enable",
	},
	"listener_config": {
		"ID": "id", "Name": "name", "Type": "type", "Enable": "enable",
		"Topic": "topic", "Config": "config", "CreatedAt": "created_at",
		"UpdatedAt": "updated_at", "PreScript": "pre_script",
	},
}

func ensureSchema(databaseType string) {
	if DB == nil {
		return
	}

	// MySQL: 迁移旧的大小写不正确的表名和列名
	if databaseType != "sqlite" {
		migrateMySQLSchema()
	}

	// 检查 listener_conn 表中 parent_id 列是否存在
	if ok, err := DB.IsTableExist(new(model.ListenerConn)); err != nil || !ok {
		return
	}

	colExists := false
	switch databaseType {
	case "sqlite":
		results, err := DB.QueryString("PRAGMA table_info(listener_conn)")
		if err == nil {
			for _, row := range results {
				if row["name"] == "parent_id" {
					colExists = true
					break
				}
			}
		}
	default:
		results, err := DB.QueryString("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'listener_conn' AND COLUMN_NAME = 'parent_id'")
		if err == nil && len(results) > 0 {
			colExists = true
		}
	}
	if colExists {
		return
	}

	sql := "ALTER TABLE listener_conn ADD COLUMN parent_id BIGINT NOT NULL DEFAULT 0"
	indexSQL := "CREATE INDEX idx_listener_conn_parent_id ON listener_conn (parent_id)"
	switch databaseType {
	case "sqlite":
		sql = "ALTER TABLE listener_conn ADD COLUMN parent_id INTEGER NOT NULL DEFAULT 0"
	}
	if _, err := DB.Exec(sql); err != nil {
		logs.Errf("ensure listener_conn.parent_id failed: %v", err)
		return
	}
	if _, err := DB.Exec(indexSQL); err != nil {
		logs.Warnf("create idx_listener_conn_parent_id failed: %v", err)
	}
}

// migrateMySQLSchema 迁移 MySQL 中旧的 PascalCase 表名和列名为 snake_case
func migrateMySQLSchema() {
	// 1. 重命名表
	for oldName, newName := range legacyTableRenames {
		if oldName == newName {
			continue
		}
		hasOld, _ := DB.IsTableExist(oldName)
		hasNew, _ := DB.IsTableExist(newName)
		if hasOld && !hasNew {
			sql := fmt.Sprintf("RENAME TABLE `%s` TO `%s`", oldName, newName)
			if _, err := DB.Exec(sql); err != nil {
				logs.Warnf("rename table %s -> %s failed: %v", oldName, newName, err)
			} else {
				logs.Infof("renamed table %s -> %s", oldName, newName)
			}
		}
	}

	// 2. 重命名列
	for table, columns := range legacyColumnRenames {
		// 检查表是否存在
		hasTable, _ := DB.IsTableExist(table)
		if !hasTable {
			continue
		}

		rows, err := DB.QueryString("SHOW COLUMNS FROM `" + table + "`")
		if err != nil {
			continue
		}
		existingCols := map[string]bool{}
		colTypes := map[string]string{}
		for _, row := range rows {
			field := row["Field"]
			existingCols[field] = true
			colTypes[field] = row["Type"]
		}

		for oldCol, newCol := range columns {
			if oldCol == newCol {
				continue
			}
			if !existingCols[oldCol] {
				continue
			}
			if existingCols[newCol] {
				// 新旧列都存在，先复制数据再删旧列
				copySQL := fmt.Sprintf("UPDATE `%s` SET `%s` = `%s` WHERE `%s` IS NULL OR `%s` = '' OR `%s` = 0", table, newCol, oldCol, newCol, newCol, newCol)
				if _, err := DB.Exec(copySQL); err != nil {
					logs.Warnf("copy %s.%s -> %s failed: %v", table, oldCol, newCol, err)
				} else {
					logs.Infof("copied data %s.%s -> %s", table, oldCol, newCol)
				}
				if _, err := DB.Exec(fmt.Sprintf("ALTER TABLE `%s` DROP COLUMN `%s`", table, oldCol)); err != nil {
					logs.Warnf("drop duplicate column %s.%s failed: %v", table, oldCol, err)
				} else {
					logs.Infof("dropped duplicate column %s.%s", table, oldCol)
				}
				continue
			}
			// 旧列存在，新列不存在，重命名
			sql := fmt.Sprintf("ALTER TABLE `%s` CHANGE `%s` `%s` %s", table, oldCol, newCol, colTypes[oldCol])
			if _, err := DB.Exec(sql); err != nil {
				logs.Warnf("rename column %s.%s -> %s failed: %v", table, oldCol, newCol, err)
			} else {
				logs.Infof("renamed column %s.%s -> %s", table, oldCol, newCol)
			}
		}
	}

	// 3. 修复主键 id 列的 AUTO_INCREMENT 属性（迁移过程中可能丢失）
	ensureAutoIncrementPK()
}

// ensureAutoIncrementPK 确保所有应有 AUTO_INCREMENT 的主键列具有该属性
func ensureAutoIncrementPK() {
	// 这些表的 id 列应为 AUTO_INCREMENT 主键
	autoIncrementTables := []string{
		"user", "listener_parent", "listener_conn", "dispatcher_config",
		"processor_chain", "operation_log", "config_snapshot", "metric",
		"listen_http", "listener_config",
	}
	for _, table := range autoIncrementTables {
		hasTable, _ := DB.IsTableExist(table)
		if !hasTable {
			continue
		}
		rows, err := DB.QueryString("SHOW COLUMNS FROM `" + table + "` WHERE Field = 'id'")
		if err != nil || len(rows) == 0 {
			continue
		}
		extra := rows[0]["Extra"]
		if extra == "auto_increment" {
			continue
		}
		colType := rows[0]["Type"]
		if colType == "" {
			colType = "bigint"
		}
		sql := fmt.Sprintf("ALTER TABLE `%s` MODIFY COLUMN `id` %s NOT NULL AUTO_INCREMENT", table, colType)
		if _, err := DB.Exec(sql); err != nil {
			logs.Warnf("set %s.id AUTO_INCREMENT failed: %v", table, err)
		} else {
			logs.Infof("set %s.id AUTO_INCREMENT", table)
		}
	}
}
