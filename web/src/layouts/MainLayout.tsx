import React, { useEffect, useState } from 'react';
import { Layout, Menu, Breadcrumb, Dropdown, Avatar, Modal, Button, Space, message, Tree, Card } from 'antd';
import {
  DesktopOutlined,
  PieChartOutlined,
  FileOutlined,
  TeamOutlined,
  UserOutlined,
  SettingOutlined,
  CloudServerOutlined,
  SendOutlined,
  CodeOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  LinkOutlined,
  ApiOutlined,
  CodeSandboxOutlined,
  GlobalOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import useUserStore from '../store/useUserStore';
import ScriptPageLayout, { ScriptItem } from '../components/ScriptPageLayout';

const { Header, Content, Footer, Sider } = Layout;
const { SubMenu } = Menu;

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [scriptModalVisible, setScriptModalVisible] = useState(false);
  const [globalScripts, setGlobalScripts] = useState<ScriptItem[]>([
    { 
      id: '1', 
      name: 'main.go', 
      enabled: true, 
      script: `package main

import (
\t"fmt"
)

func main() {
\tfmt.Println("Global Script Main")
}` 
    },
    { 
      id: '2', 
      name: 'config.go', 
      enabled: true, 
      script: `package main

var Config = "Default"` 
    },
    { 
      id: '3', 
      name: 'utils.go', 
      enabled: true, 
      script: `package main

func Help() {
\t// helper function
}` 
    },
    { 
      id: '4', 
      name: 'logger.go', 
      enabled: true, 
      script: `package main

func Log(msg string) {
\t// log function
}` 
    },
  ]);
  const [currentGlobalScript, setCurrentGlobalScript] = useState<ScriptItem | null>(null);
  const [scriptLogs, setScriptLogs] = useState<string[]>([]);
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const [dataCollectionMenu, setDataCollectionMenu] = useState<Array<{ key: string; label: string }>>([
    { key: '/data-collection/devices', label: '设备' },
    { key: '/data-collection/nodes', label: '节点' },
    { key: '/data-collection/protocols', label: '协议管理' },
  ]);

  useEffect(() => {
    if (!isAuthenticated && location.pathname !== '/login') {
      navigate('/login');
    }
  }, [isAuthenticated, location.pathname, navigate]);

  useEffect(() => {
    axios
      .get('/api/menus/data-collection')
      .then((res) => {
        if (Array.isArray(res.data)) {
          const items = res.data
            .filter((i: any) => i && i.path && i.title)
            .map((i: any) => ({ key: String(i.path), label: String(i.title) }));
          if (items.length) setDataCollectionMenu(items);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    const logout = useUserStore.getState().logout;
    logout();
    navigate('/login');
    message.success('已退出登录');
  };

  const handleChangePassword = () => {
    message.info('修改密码功能开发中');
  };

  const handleGlobalScript = () => {
    setScriptModalVisible(true);
  };

  const handleUpdateScript = (updatedItem: ScriptItem) => {
    setGlobalScripts(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
    if (currentGlobalScript?.id === updatedItem.id) {
      setCurrentGlobalScript(updatedItem);
    }
  };

  const handleCreateScript = () => {
    const newScript: ScriptItem = {
      id: Date.now().toString(),
      name: `new_script_${globalScripts.length + 1}.go`,
      enabled: true,
      script: 'package main\n\n'
    };
    setGlobalScripts(prev => [...prev, newScript]);
    message.success('新建脚本成功');
  };

  const handleDeleteScript = (id: string) => {
    setGlobalScripts(prev => prev.filter(item => item.id !== id));
    if (currentGlobalScript?.id === id) {
      setCurrentGlobalScript(null);
    }
    message.success('删除成功');
  };

  const handleSaveScript = (item: ScriptItem) => {
    message.success(`全局脚本 "${item.name}" 已保存`);
  };

  const handleExecuteScript = () => {
    if (!currentGlobalScript) {
      message.warning('请先选择脚本');
      return;
    }
    const newLog = `[${new Date().toLocaleTimeString()}] 执行脚本: ${currentGlobalScript.name}`;
    setScriptLogs(prev => [...prev, newLog]);
    message.success('脚本执行成功');
  };

  const onCollapse = (collapsed: boolean) => {
    setCollapsed(collapsed);
  };

  const handleMenuClick = (e: any) => {
    navigate(e.key);
  };

  return (
    <>
      <Layout style={{ height: '100vh', overflow: 'hidden', background: '#f0f2f5' }}>
      <Sider 
        collapsible 
        collapsed={collapsed} 
        onCollapse={onCollapse}
        style={{
          boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
          overflow: 'auto',
          height: '100vh',
          position: 'sticky',
          top: 0,
          left: 0,
        }}
      >
        <div 
          className="logo" 
          style={{ 
            height: 64, 
            margin: 16, 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: collapsed ? 14 : 18,
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)'
          }}
        >
          {collapsed ? 'GG' : 'General Gateway'}
        </div>
        <Menu 
          theme="dark" 
          defaultSelectedKeys={[location.pathname]} 
          mode="inline" 
          onClick={handleMenuClick}
          style={{
            background: '#001529',
            borderRight: 'none'
          }}
        >
          <Menu.Item key="/dashboard" icon={<PieChartOutlined />}>
            首页
          </Menu.Item>
          <Menu.Item key="/data/monitor" icon={<LineChartOutlined />}>
            数据监控
          </Menu.Item>
          <SubMenu key="sub_listener" icon={<GlobalOutlined />} title="数据监听">
            <Menu.Item key="/data-listener/http" icon={<GlobalOutlined />}>HTTP 监听</Menu.Item>
            <Menu.Item key="/data-listener/mqtt" icon={<CloudServerOutlined />}>MQTT 监听</Menu.Item>
            <Menu.Item key="/data-listener/script" icon={<FileTextOutlined />}>脚本监听</Menu.Item>
            <Menu.Item key="/data-listener/parser" icon={<CodeOutlined />}>数据解析</Menu.Item>
          </SubMenu>
          <SubMenu key="sub1" icon={<DesktopOutlined />} title="数据采集">
            <Menu.Item key="/data-collection/devices" icon={<DesktopOutlined />}>设备</Menu.Item>
            <Menu.Item key="/data-collection/nodes" icon={<TeamOutlined />}>节点</Menu.Item>
            <Menu.Item key="/data-collection/protocols" icon={<CodeOutlined />}>协议管理</Menu.Item>
            <Menu.Item key="/scripts/collection" icon={<FileTextOutlined />}>脚本采集</Menu.Item>
          </SubMenu>
          <SubMenu key="sub2" icon={<DatabaseOutlined />} title="数据服务">
            <Menu.Item key="/data-services/modbus-tcp" icon={<LinkOutlined />}>Modbus TCP</Menu.Item>
            <Menu.Item key="/data-services/serial" icon={<ApiOutlined />}>串口服务</Menu.Item>
            <Menu.Item key="/data-services/opc-ua" icon={<ApiOutlined />}>OPC UA</Menu.Item>
            <Menu.Item key="/data-services/mqtt-broker" icon={<LinkOutlined />}>MQTT Broker</Menu.Item>
            <Menu.Item key="/scripts/services" icon={<FileTextOutlined />}>脚本服务</Menu.Item>
          </SubMenu>
          <SubMenu key="sub3" icon={<SendOutlined />} title="数据转发">
            <Menu.Item key="/data-forwarding/mqtt" icon={<CloudServerOutlined />}>MQTT转发</Menu.Item>
            <Menu.Item key="/data-forwarding/http" icon={<SendOutlined />}>HTTP转发</Menu.Item>
            <Menu.Item key="/data-forwarding/scripts" icon={<FileTextOutlined />}>脚本转发</Menu.Item>
          </SubMenu>
          <SubMenu key="sub4" icon={<SettingOutlined />} title="系统管理">
            <Menu.Item key="/system/ssh" icon={<CodeOutlined />}>SSH客户端</Menu.Item>
            <Menu.Item key="/system/config" icon={<SettingOutlined />}>全局配置</Menu.Item>
          </SubMenu>
        </Menu>
      </Sider>
      <Layout className="site-layout" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header 
          className="site-layout-background" 
          style={{ 
            padding: '0 24px', 
            background: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }} 
        >
          <Breadcrumb style={{ margin: 0 }}>
            <Breadcrumb.Item>
              <span style={{ color: '#1890ff' }}>General Gateway</span>
            </Breadcrumb.Item>
            <Breadcrumb.Item>{location.pathname}</Breadcrumb.Item>
          </Breadcrumb>
          <Space size="middle">
            <Button 
              type="text" 
              icon={<CodeSandboxOutlined />} 
              onClick={handleGlobalScript}
              style={{ 
                fontSize: '16px',
                color: '#1890ff',
                border: '1px solid #d9d9d9',
                borderRadius: '6px',
                padding: '4px 8px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            />
            <Dropdown
              overlay={
                <Menu>
                  <Menu.Item key="profile" icon={<UserOutlined />}>
                    个人信息
                  </Menu.Item>
                  <Menu.Item key="password" icon={<SettingOutlined />} onClick={handleChangePassword}>
                    修改密码
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item key="logout" icon={<UserOutlined />} onClick={handleLogout}>
                    退出登录
                  </Menu.Item>
                </Menu>
              }
              placement="bottomRight"
            >
              <Avatar 
                icon={<UserOutlined />} 
                style={{ 
                  cursor: 'pointer', 
                  backgroundColor: '#1890ff',
                  border: '1px solid #d9d9d9'
                }}
              />
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: '16px', background: 'transparent', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div 
            className="site-layout-background" 
            style={{ 
              padding: 0, 
              background: 'transparent',
              borderRadius: '8px',
              flex: 1,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Outlet />
            </div>
          </div>
        </Content>
        <Footer style={{ 
          textAlign: 'center', 
          background: '#fff',
          boxShadow: '0 -2px 8px rgba(0,0,0,0.06)',
          flexShrink: 0,
        }}>
          Edge Gateway ©2025 Created by Trae AI
        </Footer>
      </Layout>
    </Layout>
    
    <Modal
      title="全局脚本编辑器"
      visible={scriptModalVisible}
      onCancel={() => setScriptModalVisible(false)}
      width={1200}
      footer={null}
      bodyStyle={{ height: '80vh', padding: 0 }}
      style={{ top: 20 }}
    >
      <ScriptPageLayout
        title="全局脚本列表"
        items={globalScripts}
        onSelect={(item) => setCurrentGlobalScript(item)}
        onUpdate={handleUpdateScript}
        onCreate={handleCreateScript}
        onDelete={handleDeleteScript}
        onSave={handleSaveScript}
        showEnableSwitch={false}
        extraButtons={
          <Button type="primary" ghost icon={<CodeSandboxOutlined />} onClick={handleExecuteScript}>
            执行脚本
          </Button>
        }
        bottomPanel={
          <Card 
            size="small" 
            title="执行日志" 
            style={{ marginTop: 0, borderTop: '1px solid #f0f0f0', borderRadius: 0 }}
            bodyStyle={{ 
              height: 150, 
              overflowY: 'auto', 
              padding: '8px 12px',
              background: '#1e1e1e',
              color: '#00ff00',
              fontFamily: 'monospace'
            }}
          >
            {scriptLogs.length === 0 ? (
              <div style={{ color: '#666' }}>暂无日志...</div>
            ) : (
              <div>
                {scriptLogs.map((l, idx) => (
                  <div key={idx}>{l}</div>
                ))}
              </div>
            )}
          </Card>
        }
      />
    </Modal>
    </>
  );
};

export default MainLayout;
