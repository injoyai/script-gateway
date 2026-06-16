import React, { useEffect, useState } from 'react';
import { Form, Input, Button, Checkbox, message } from 'antd';
import { UserOutlined, LockOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import useUserStore from '../store/useUserStore';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const login = useUserStore((state) => state.login);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const onFinish = async (values: any) => {
    setLoading(true);
    const success = await login(values.username, values.password);
    setLoading(false);
    if (success) {
      message.success('登录成功');
      navigate('/');
    } else {
      message.error('用户名或密码错误');
    }
  };

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const weekday = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: '1.1fr 1fr',
        background: 'var(--paper-1)',
        overflow: 'hidden',
      }}
    >
      {/* 左侧：品牌区 */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRight: '1px solid var(--line)',
          background:
            'linear-gradient(135deg, #fffdf7 0%, #faf6ec 50%, #f3ecd8 100%)',
        }}
      >
        {/* 纸纹底纹 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(rgba(150,130,90,0.08) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />
        {/* 暖色光晕 */}
        <div
          style={{
            position: 'absolute',
            top: '-10%',
            right: '-10%',
            width: '60%',
            height: '60%',
            background: 'radial-gradient(circle, rgba(184,92,0,0.12) 0%, transparent 60%)',
            filter: 'blur(40px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-15%',
            left: '-5%',
            width: '60%',
            height: '60%',
            background: 'radial-gradient(circle, rgba(15,94,77,0.10) 0%, transparent 60%)',
            filter: 'blur(40px)',
          }}
        />

        {/* 装饰：印章和品牌字样 */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            right: '6%',
            transform: 'translateY(-50%) rotate(-8deg)',
            width: 220,
            height: 220,
            border: '3px solid rgba(166, 69, 40, 0.16)',
            borderRadius: 18,
            display: 'grid',
            placeItems: 'center',
            color: 'rgba(166, 69, 40, 0.2)',
            fontFamily: 'Manrope, sans-serif',
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: '0.18em',
            padding: 20,
            lineHeight: 1.2,
            textAlign: 'center',
          }}
        >
          SCRIPT
          <br />
          GATEWAY
        </div>

        {/* 内容 */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            padding: '52px 60px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {/* 顶部 logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="sg-seal" style={{ width: 42, height: 42, fontSize: 16 }}>
              SG
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 18,
                  color: 'var(--ink-0)',
                  letterSpacing: '0.02em',
                }}
              >
                脚本网关
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-han)',
                  fontSize: 12,
                  color: 'var(--ink-2)',
                  marginTop: 2,
                }}
              >
                Script Gateway · 边缘运行时
              </div>
            </div>
          </div>

          {/* 中部 hero */}
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 14px',
                borderRadius: 999,
                background: 'rgba(15,94,77,0.08)',
                color: 'var(--pine)',
                fontFamily: 'var(--font-han)',
                fontSize: 13,
                marginBottom: 28,
              }}
            >
              <span className="sg-dot" />
              系统在线 · 等待接入
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 56,
                fontWeight: 700,
                lineHeight: 1.15,
                color: 'var(--ink-0)',
                margin: 0,
                letterSpacing: '0.02em',
              }}
            >
              一座网关，
              <br />
              <span style={{ color: 'var(--pine)' }}>万千协议归流。</span>
            </h1>
            <p
              style={{
                marginTop: 28,
                fontSize: 16,
                lineHeight: 1.8,
                color: 'var(--ink-1)',
                maxWidth: 480,
                fontFamily: 'var(--font-han)',
              }}
            >
              统一管道架构 · 脚本沙盒 · 实时可观测。
              <br />
              将异构数据源汇入同一管道，可编排、可追踪、可热加载。
            </p>

            {/* 统计 */}
            <div
              style={{
                display: 'flex',
                gap: 48,
                marginTop: 44,
                paddingTop: 28,
                borderTop: '1px dashed var(--line-dash)',
                maxWidth: 480,
              }}
            >
              {[
                { v: '6', l: '种监听器' },
                { v: '5', l: '种分发器' },
                { v: '<1', l: '毫秒延迟' },
              ].map((s) => (
                <div key={s.l}>
                  <div className="sg-num" style={{ fontSize: 30, color: 'var(--ink-0)' }}>
                    {s.v}
                    <span
                      style={{
                        fontSize: 14,
                        color: 'var(--ink-3)',
                        marginLeft: 4,
                        fontFamily: 'var(--font-han)',
                        fontWeight: 400,
                      }}
                    >
                      ＋
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-han)',
                      fontSize: 13,
                      color: 'var(--ink-2)',
                      marginTop: 6,
                    }}
                  >
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 底部信息 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--ink-2)',
              letterSpacing: '0.06em',
            }}
          >
            <span>{dateStr} · {weekday}</span>
            <span className="sg-num" style={{ fontSize: 13 }}>{timeStr}</span>
            <span>NODE · GW-01</span>
          </div>
        </div>
      </div>

      {/* 右侧：表单区 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 48,
          background: 'var(--paper-0)',
          position: 'relative',
        }}
      >
        {/* 极淡的格纹 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(var(--line-soft) 1px, transparent 1px), linear-gradient(90deg, var(--line-soft) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
          }}
        />

        <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
          <div className="sg-eyebrow" style={{ marginBottom: 14 }}>
            欢迎使用
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 34,
              fontWeight: 700,
              color: 'var(--ink-0)',
              margin: 0,
              letterSpacing: '0.02em',
            }}
          >
            登录控制台
          </h2>
          <p
            style={{
              marginTop: 10,
              marginBottom: 40,
              fontSize: 14,
              color: 'var(--ink-2)',
              fontFamily: 'var(--font-han)',
            }}
          >
            请输入您的凭证，进入网关管理后台。
          </p>

          <Form
            name="login"
            initialValues={{ remember: true }}
            onFinish={onFinish}
            size="large"
            layout="vertical"
          >
            <Form.Item
              label="用户名"
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: 'var(--ink-3)' }} />}
                placeholder="例如：admin"
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: 'var(--ink-3)' }} />}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 28 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Form.Item name="remember" valuePropName="checked" noStyle>
                  <Checkbox>
                    <span style={{ fontFamily: 'var(--font-han)', fontSize: 13 }}>记住本机</span>
                  </Checkbox>
                </Form.Item>
                <Button
                  type="link"
                  onClick={() => {
                    message.info('请联系管理员重置密码');
                  }}
                  style={{
                    padding: 0,
                    height: 'auto',
                    fontFamily: 'var(--font-han)',
                    fontSize: 13,
                    color: 'var(--pine)',
                    textDecoration: 'none',
                  }}
                >
                  忘记密码？
                </Button>
              </div>
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                icon={!loading ? <ArrowRightOutlined /> : undefined}
                style={{
                  height: 46,
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                }}
              >
                {loading ? '正在登录…' : '进入控制台'}
              </Button>
            </Form.Item>
          </Form>

          <div
            style={{
              marginTop: 36,
              paddingTop: 22,
              borderTop: '1px dashed var(--line-dash)',
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--ink-3)',
              letterSpacing: '0.06em',
            }}
          >
            <span>© 2026 SCRIPT GATEWAY</span>
            <span>TLS 1.3</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
