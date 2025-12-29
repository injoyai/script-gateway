import React from 'react';
import { Form, Input, Button, Checkbox, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import useUserStore from '../store/useUserStore';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const login = useUserStore((state) => state.login);

  const onFinish = (values: any) => {
    console.log('Received values of form: ', values);
    // Mock login
    if (values.username === 'admin' && values.password === 'admin') {
      login(values.username);
      message.success('登录成功');
      navigate('/');
    } else {
      message.error('用户名或密码错误 (admin/admin)');
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        width: '200%',
        height: '200%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px',
        animation: 'move 20s linear infinite',
      }} />
      <Card 
        title={
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ 
              fontSize: 28, 
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: 8
            }}>
              Script Gateway
            </div>
            <div style={{ color: '#999', fontSize: 14 }}>脚本网关</div>
          </div>
        } 
        style={{ 
          width: 400,
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          border: 'none'
        }}
        headStyle={{
          borderBottom: '1px solid #f0f0f0',
          padding: '24px'
        }}
      >
        <Form
          name="normal_login"
          className="login-form"
          initialValues={{ remember: true }}
          onFinish={onFinish}
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名!' }]}
          >
            <Input 
              prefix={<UserOutlined style={{ color: '#667eea' }} />} 
              placeholder="用户名" 
              style={{ borderRadius: '6px' }}
            />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码!' }]}
          >
            <Input
              prefix={<LockOutlined style={{ color: '#667eea' }} />}
              type="password"
              placeholder="密码"
              style={{ borderRadius: '6px' }}
            />
          </Form.Item>
          <Form.Item>
            <Form.Item name="remember" valuePropName="checked" noStyle>
              <Checkbox>记住我</Checkbox>
            </Form.Item>
          </Form.Item>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              className="login-form-button" 
              style={{ 
                width: '100%',
                height: 40,
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
                fontSize: 16,
                fontWeight: 500
              }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Login;
