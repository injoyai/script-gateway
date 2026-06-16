package api

import (
	"time"

	"github.com/injoyai/frame/fbr"
	"github.com/injoyai/script-gateway/app/common"
	"github.com/injoyai/script-gateway/app/model"
	"github.com/injoyai/script-gateway/internal/auth"
)

// Auth 认证 API
type Auth struct{}

func (*Auth) Login(c fbr.Ctx) {
	type LoginReq struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	req := new(LoginReq)
	c.Parse(req)

	user := new(model.User)
	has, err := common.DB.Where("username = ?", req.Username).Get(user)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Fail("用户名或密码错误")
		return
	}

	if !auth.CheckPassword(req.Password, user.Password) {
		c.Fail("用户名或密码错误")
		return
	}

	token, err := auth.GenerateToken(user.ID, user.Username, user.Role)
	if err != nil {
		c.Fail(err)
		return
	}

	// 更新最后登录时间
	common.DB.ID(user.ID).Cols("last_login_at").Update(&model.User{LastLoginAt: time.Now()})

	c.Succ(map[string]any{
		"token": token,
		"user": map[string]any{
			"id":       user.ID,
			"username": user.Username,
			"role":     user.Role,
		},
	})
}

func (*Auth) Info(c fbr.Ctx) {
	// 从 context 中获取用户信息 (由中间件设置)
	userID := c.GetInt64("user_id")
	if userID == 0 {
		c.Fail("未登录")
		return
	}
	user := new(model.User)
	has, err := common.DB.ID(userID).Get(user)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Fail("用户不存在")
		return
	}
	c.Succ(map[string]any{
		"id":       user.ID,
		"username": user.Username,
		"role":     user.Role,
	})
}

func (*Auth) ChangePassword(c fbr.Ctx) {
	type ChangePwdReq struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	req := new(ChangePwdReq)
	c.Parse(req)

	userID := c.GetInt64("user_id")
	user := new(model.User)
	has, err := common.DB.ID(userID).Get(user)
	if err != nil {
		c.Fail(err)
		return
	}
	if !has {
		c.Fail("用户不存在")
		return
	}

	if !auth.CheckPassword(req.OldPassword, user.Password) {
		c.Fail("旧密码错误")
		return
	}

	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		c.Fail(err)
		return
	}

	_, err = common.DB.ID(userID).Cols("password").Update(&model.User{Password: hash})
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}

// User 用户管理 API
type User struct{}

func (*User) List(c fbr.Ctx) {
	var list []*model.User
	err := common.DB.Find(&list)
	if err != nil {
		c.Fail(err)
		return
	}
	// 隐藏密码
	for _, u := range list {
		u.Password = ""
	}
	c.Succ(list)
}

func (*User) Create(c fbr.Ctx) {
	data := new(model.User)
	c.Parse(data)
	if data.Username == "" {
		c.Fail("用户名不能为空")
		return
	}
	if data.Password == "" {
		c.Fail("密码不能为空")
		return
	}

	hash, err := auth.HashPassword(data.Password)
	if err != nil {
		c.Fail(err)
		return
	}
	data.Password = hash

	if data.Role == "" {
		data.Role = "viewer"
	}

	_, err = common.DB.InsertOne(data)
	if err != nil {
		c.Fail(err)
		return
	}
	data.Password = ""
	c.Succ(data)
}

func (*User) Update(c fbr.Ctx) {
	data := new(model.User)
	c.Parse(data)
	if data.ID == 0 {
		c.Fail("ID不能为空")
		return
	}

	cols := []string{"username", "role"}
	if data.Password != "" {
		hash, err := auth.HashPassword(data.Password)
		if err != nil {
			c.Fail(err)
			return
		}
		data.Password = hash
		cols = append(cols, "password")
	}

	_, err := common.DB.ID(data.ID).Cols(cols...).Update(data)
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(data)
}

func (*User) Delete(c fbr.Ctx) {
	id := c.GetInt64("id")
	_, err := common.DB.ID(id).Delete(new(model.User))
	if err != nil {
		c.Fail(err)
		return
	}
	c.Succ(true)
}
