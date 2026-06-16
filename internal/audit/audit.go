package audit

import (
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
)

// Log 记录操作日志
func Log(userID int64, username, action, resource string, resourceID int64, detail, ip string) {
	_, _ = common.DB.InsertOne(&model.OperationLog{
		UserID:     userID,
		Username:   username,
		Action:     action,
		Resource:   resource,
		ResourceID: resourceID,
		Detail:     detail,
		IP:         ip,
	})
}

// LogCreate 记录创建操作
func LogCreate(userID int64, username, resource string, resourceID int64, detail, ip string) {
	Log(userID, username, "create", resource, resourceID, detail, ip)
}

// LogUpdate 记录更新操作
func LogUpdate(userID int64, username, resource string, resourceID int64, detail, ip string) {
	Log(userID, username, "update", resource, resourceID, detail, ip)
}

// LogDelete 记录删除操作
func LogDelete(userID int64, username, resource string, resourceID int64, detail, ip string) {
	Log(userID, username, "delete", resource, resourceID, detail, ip)
}

// LogEnable 记录启用操作
func LogEnable(userID int64, username, resource string, resourceID int64, detail, ip string) {
	Log(userID, username, "enable", resource, resourceID, detail, ip)
}

// LogDisable 记录禁用操作
func LogDisable(userID int64, username, resource string, resourceID int64, detail, ip string) {
	Log(userID, username, "disable", resource, resourceID, detail, ip)
}

// LogLogin 记录登录操作
func LogLogin(userID int64, username, ip string) {
	Log(userID, username, "login", "user", userID, "", ip)
}
