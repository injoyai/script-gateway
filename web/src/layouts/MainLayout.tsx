import React, { useEffect, useMemo, useState } from 'react';
import {
  PieChartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DesktopOutlined,
  DatabaseOutlined,
  SendOutlined,
  GlobalOutlined,
  CodeOutlined,
  SettingOutlined,
  UserOutlined,
  KeyOutlined,
  PoweroffOutlined,
  CodeSandboxOutlined,
  ApiOutlined,
  InboxOutlined,
  LineChartOutlined,
  CloudServerOutlined,
  FileTextOutlined,
  PartitionOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { Layout, Menu, Dropdown, Button, Tooltip, Modal, Input, message } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import useUserStore from '../store/useUserStore';
import useScriptEditorStore from '../store/useScriptEditorStore';
import ScriptEditorDrawer from '../components/ScriptEditorDrawer';
import TopicMonitorDrawer from '../components/TopicMonitorDrawer';

const { Header, Sider, Content } = Layout;
const { SubMenu } = Menu;

const dataCollectionMenu = [
  { key: '/data-collection/devices', label: '设备列表' },
  { key: '/data-collection/nodes', label: '点位列表' },
  { key: '/data-collection/protocols', label: '协议管理' },
];

const cnSeg = (seg: string) => {
  const map: Record<string, string> = {
    dashboard: '总览',
    data: '数据',
    monitor: '实时监控',
    queue: '消息队列',
    unified: '统一管理',
    'processor-chains': '脚本处理',
    'data-flow': '数据流可视化',
    dispatchers: '分发器管理',
    'data-listener': '数据监听',
    http: 'HTTP',
    mqtt: 'MQTT',
    tcp: 'TCP',
    udp: 'UDP',
    serial: '串口',
    script: '脚本',
    parser: '数据解析',
    scripts: '脚本',
    collection: '脚本采集',
    services: '脚本服务',
    manager: '脚本管理',
    'data-collection': '数据采集',
    devices: '设备列表',
    nodes: '点位列表',
    protocols: '协议管理',
    'data-forwarding': '数据转发',
    processors: 'HTTP 转发',
    system: '系统',
    ssh: 'SSH 客户端',
    config: '全局配置',
    plugins: '插件管理',
  };
  return map[seg] || seg;
};

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useUserStore((s) => s.logout);
  const openEditor = useScriptEditorStore((s) => s.openEditor);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('zh-CN', { hour12: false }));
      setDateStr(
        now.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleChangePassword = () => {
    let nextPassword = '';
    Modal.confirm({
      title: '修改密码',
      icon: null,
      content: (
        <Input.Password
          placeholder="请输入新密码"
          onChange={(e) => {
            nextPassword = e.target.value;
          }}
        />
      ),
      onOk: async () => {
        if (!nextPassword) {
          message.warning('请输入新密码');
          throw new Error('empty');
        }
        try {
          const res = await fetch('/api/user/password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: nextPassword }),
          });
          const json = await res.json();
          if (json.code !== 0 && json.code !== 200) {
            throw new Error(json.msg || '修改失败');
          }
          message.success('密码修改成功');
        } catch (error: any) {
          message.error(error?.message || '修改失败');
          throw error;
        }
      },
    });
  };

  const handleGlobalScript = () => {
    openEditor({
      name: '全局脚本',
      language: 'go',
      content: '',
      onSave: async () => {
        message.success('已保存');
      },
    });
  };

  const segments = useMemo(
    () => location.pathname.split('/').filter(Boolean),
    [location.pathname]
  );

  return (
    <>
      <Layout
        hasSider
        style={{
          minHeight: '100vh',
          width: '100vw',
          overflow: 'hidden',
        }}
      >
        <Sider
          width={240}
          collapsedWidth={78}
          collapsed={collapsed}
          trigger={null}
          theme="light"
          style={{ borderRight: '1px solid var(--line)' }}
        >
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: collapsed ? '20px 10px 14px' : '22px 18px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 'var(--r-md)',
                  position: 'relative',
                  flexShrink: 0,
                  background: 'var(--indigo)',
                  boxShadow:
                    '0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 16px rgba(58,79,122,0.22)',
                }}
              >
                <svg
                  viewBox="0 0 38 38"
                  width="38"
                  height="38"
                  style={{ position: 'absolute', inset: 0, display: 'block' }}
                >
                  <path
                    d="M5 25 Q 19 12 33 25"
                    fill="none"
                    stroke="#fffdf7"
                    strokeWidth="1"
                    strokeLinecap="round"
                    opacity="0.45"
                  />
                  <text
                    x="19"
                    y="25"
                    textAnchor="middle"
                    fontFamily="'Manrope','LXGW WenKai','PingFang SC',sans-serif"
                    fontSize="16"
                    fontWeight={700}
                    fill="#fffdf7"
                    letterSpacing="-0.3"
                  >
                    SG
                  </text>
                  <circle cx="29.5" cy="12.5" r="1.4" fill="#fffdf7" opacity="0.85" />
                </svg>
              </div>
              {!collapsed && (
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: 'var(--ink-0)',
                      letterSpacing: '0.01em',
                      lineHeight: 1.25,
                      fontFamily: 'var(--font-num)',
                    }}
                  >
                    Script Gateway
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 10.5,
                      color: 'var(--ink-3)',
                      letterSpacing: '0.32em',
                      textTransform: 'uppercase',
                      fontFamily: 'var(--font-num)',
                    }}
                  >
                    Ingest · Route · Process
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: collapsed ? '0 10px 12px' : '0 16px 14px' }}>
            <div
              style={{
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-md)',
                padding: collapsed ? '8px 0' : '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'space-between',
                gap: 8,
                background: 'var(--paper-0)',
                fontSize: 12.5,
                color: 'var(--ink-1)',
                fontFamily: 'var(--font-han)',
                boxShadow: 'var(--shadow-1)',
              }}
            >
              <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'var(--pine)',
                    display: 'inline-block',
                    boxShadow: '0 0 0 3px var(--pine-glow)',
                  }}
                />
              </span>
              {!collapsed && (
                <>
                  <span>服务运行中</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-3)',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {timeStr}
                  </span>
                </>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 0 8px' }}>
            {!collapsed && (
              <div
                style={{
                  padding: '12px 22px 6px',
                  fontSize: 10.5,
                  color: 'var(--ink-3)',
                  letterSpacing: '0.36em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  fontFamily: 'var(--font-num)',
                }}
              >
                工作台 · Workspace
              </div>
            )}
            <Menu theme="light" selectedKeys={[location.pathname]} mode="inline" onClick={handleMenuClick}>
              <Menu.Item key="/dashboard" icon={<PieChartOutlined />}>总览</Menu.Item>
              <Menu.Item key="/data/monitor" icon={<LineChartOutlined />}>实时监控</Menu.Item>
              <Menu.Item key="/data/queue" icon={<InboxOutlined />}>消息队列</Menu.Item>
            </Menu>

            {!collapsed && (
              <div
                style={{
                  padding: '14px 22px 6px',
                  fontSize: 10.5,
                  color: 'var(--ink-3)',
                  letterSpacing: '0.36em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  fontFamily: 'var(--font-num)',
                }}
              >
                统一管理 · Unified
              </div>
            )}
            <Menu theme="light" selectedKeys={[location.pathname]} mode="inline" onClick={handleMenuClick}>
              <Menu.Item key="/unified/data-flow" icon={<PartitionOutlined />}>数据流可视化</Menu.Item>
              <Menu.Item key="/unified/processor-chains" icon={<ApiOutlined />}>脚本处理</Menu.Item>
              <Menu.Item key="/unified/dispatchers" icon={<SendOutlined />}>分发器管理</Menu.Item>
            </Menu>

            {!collapsed && (
              <div
                style={{
                  padding: '14px 22px 6px',
                  fontSize: 10.5,
                  color: 'var(--ink-3)',
                  letterSpacing: '0.36em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  fontFamily: 'var(--font-num)',
                }}
              >
                数据管道 · Pipeline
              </div>
            )}
            <Menu theme="light" selectedKeys={[location.pathname]} mode="inline" onClick={handleMenuClick}>
              <SubMenu key="sub_listener" icon={<GlobalOutlined />} title="数据监听">
                <Menu.Item key="/data-listener/http">HTTP 监听</Menu.Item>
                <Menu.Item key="/data-listener/mqtt">MQTT 监听</Menu.Item>
                <Menu.Item key="/data-listener/tcp">TCP 监听</Menu.Item>
                <Menu.Item key="/data-listener/udp">UDP 监听</Menu.Item>
                <Menu.Item key="/data-listener/serial">串口监听</Menu.Item>
                <Menu.Item key="/data-listener/script">脚本监听</Menu.Item>
                <Menu.Item key="/data-listener/parser">数据解析</Menu.Item>
              </SubMenu>
              <SubMenu key="sub1" icon={<DesktopOutlined />} title="数据采集">
                {dataCollectionMenu.map((m) => (
                  <Menu.Item key={m.key}>{m.label}</Menu.Item>
                ))}
                <Menu.Item key="/scripts/collection">脚本采集</Menu.Item>
              </SubMenu>
              <SubMenu key="sub2" icon={<DatabaseOutlined />} title="数据服务">
                <Menu.Item key="/data-services/modbus-tcp">Modbus TCP</Menu.Item>
                <Menu.Item key="/data-services/serial">串口服务</Menu.Item>
                <Menu.Item key="/data-services/opc-ua">OPC UA</Menu.Item>
                <Menu.Item key="/data-services/mqtt-broker">MQTT 代理</Menu.Item>
                <Menu.Item key="/scripts/services">脚本服务</Menu.Item>
              </SubMenu>
              <SubMenu key="sub3" icon={<SendOutlined />} title="数据转发">
                <Menu.Item key="/data-forwarding/mqtt" icon={<CloudServerOutlined />}>MQTT 转发</Menu.Item>
                <Menu.Item key="/data-forwarding/http">HTTP 转发</Menu.Item>
                <Menu.Item key="/data-forwarding/scripts" icon={<FileTextOutlined />}>脚本转发</Menu.Item>
              </SubMenu>
            </Menu>

            {!collapsed && (
              <div
                style={{
                  padding: '14px 22px 6px',
                  fontSize: 10.5,
                  color: 'var(--ink-3)',
                  letterSpacing: '0.36em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  fontFamily: 'var(--font-num)',
                }}
              >
                系统 · System
              </div>
            )}
            <Menu theme="light" selectedKeys={[location.pathname]} mode="inline" onClick={handleMenuClick}>
              <Menu.Item key="/system/ssh" icon={<CodeOutlined />}>SSH 客户端</Menu.Item>
              <Menu.Item key="/system/plugins" icon={<AppstoreOutlined />}>插件管理</Menu.Item>
              <Menu.Item key="/system/config" icon={<SettingOutlined />}>全局配置</Menu.Item>
            </Menu>
          </div>

          <div
            style={{
              borderTop: '1px dashed var(--line-dash)',
              padding: collapsed ? '10px 8px 12px' : '12px 16px 14px',
              display: 'flex',
              justifyContent: collapsed ? 'center' : 'space-between',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            {!collapsed && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  letterSpacing: '0.06em',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--indigo-soft)',
                    color: 'var(--indigo)',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}
                >
                  v1.0
                </span>
                <span>2026</span>
              </span>
            )}
            <Tooltip title={collapsed ? '展开侧栏' : '收起侧栏'} placement="right">
              <Button
                type="text"
                size="small"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                style={{
                  width: 28,
                  height: 28,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              />
            </Tooltip>
          </div>
          </div>
        </Sider>

        <Layout style={{ height: '100vh', display: 'flex', flexDirection: 'column', minWidth: 0, width: 0, flex: '1 1 0' }}>
          <Header
            style={{
              padding: '0 28px',
              height: 60,
              lineHeight: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              borderBottom: '1px solid var(--line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 10.5,
                  color: 'var(--ink-3)',
                  letterSpacing: '0.36em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  fontFamily: 'var(--font-num)',
                }}
              >
                位置 · Location
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  color: 'var(--ink-0)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-han)',
                }}
              >
                <span style={{ color: 'var(--ink-2)' }}>首页</span>
                {segments.length === 0
                  ? null
                  : segments.map((seg, i) => (
                      <React.Fragment key={i}>
                        <span style={{ color: 'var(--ink-3)' }}>·</span>
                        <span
                          style={{
                            color: i === segments.length - 1 ? 'var(--indigo)' : 'var(--ink-1)',
                            fontWeight: i === segments.length - 1 ? 600 : 400,
                          }}
                        >
                          {cnSeg(seg)}
                        </span>
                      </React.Fragment>
                    ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  fontSize: 11.5,
                  color: 'var(--ink-3)',
                  letterSpacing: '0.06em',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {dateStr}
              </span>
              <Tooltip title="全局脚本">
                <Button
                  type="text"
                  icon={<CodeSandboxOutlined />}
                  onClick={handleGlobalScript}
                />
              </Tooltip>
              <div style={{ width: 1, height: 18, background: 'var(--line)' }} />
              <Dropdown
                overlay={
                  <Menu>
                    <Menu.Item key="profile" icon={<UserOutlined />}>个人信息</Menu.Item>
                    <Menu.Item key="password" icon={<KeyOutlined />} onClick={handleChangePassword}>修改密码</Menu.Item>
                    <Menu.Divider />
                    <Menu.Item key="logout" icon={<PoweroffOutlined />} onClick={handleLogout}>退出登录</Menu.Item>
                  </Menu>
                }
                placement="bottomRight"
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    padding: '4px 12px 4px 4px',
                    borderRadius: 999,
                    border: '1px solid var(--line)',
                    background: 'var(--paper-0)',
                    boxShadow: 'var(--shadow-1)',
                  }}
                >
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: 'var(--indigo)',
                      color: 'var(--paper-0)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 12,
                      fontFamily: 'var(--font-num)',
                      letterSpacing: '0.02em',
                    }}
                  >
                    A
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--ink-0)',
                      fontFamily: 'var(--font-han)',
                    }}
                  >
                    管理员
                  </span>
                  <span style={{ color: 'var(--ink-3)', fontSize: 10 }}>▾</span>
                </div>
              </Dropdown>
            </div>
          </Header>

          <Content style={{ flex: 1, overflow: 'auto', padding: 28, minWidth: 0 }}>
            <Outlet />
          </Content>
        </Layout>
      </Layout>

      <TopicMonitorDrawer />
      <ScriptEditorDrawer />
    </>
  );
};

export default MainLayout;
