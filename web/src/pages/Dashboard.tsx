import React, { useState, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { Spin, Tooltip } from 'antd';
import {
  RiseOutlined,
  CloudServerOutlined,
  SendOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
} from '@ant-design/icons';

const API_BASE = '/api';

const formatNum = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' 万';
  if (n >= 10_000) return (n / 10_000).toFixed(1) + ' 万';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + ' 千';
  return String(n);
};

interface KpiProps {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  color?: string;
  bg?: string;
  icon: React.ReactNode;
}

const Kpi: React.FC<KpiProps> = ({ label, value, unit, hint, color, bg, icon }) => (
  <div
    className="sg-kpi"
    style={{
      ['--kpi-color' as any]: color ?? 'var(--pine)',
      ['--kpi-bg' as any]: bg ?? 'var(--pine-soft)',
    }}
  >
    <div className="sg-kpi__icon">{icon}</div>
    <div className="sg-kpi__label">{label}</div>
    <div className="sg-kpi__value">
      <span className="sg-num">{value}</span>
      {unit && <span className="sg-kpi__unit">{unit}</span>}
    </div>
    <div className="sg-kpi__meta">
      <span className="sg-dot" />
      {hint || '运行正常'}
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const [loading] = useState(false);
  const [systemInfo, setSystemInfo] = useState<any>({
    active_listeners: 0,
    active_dispatchers: 0,
    metrics: {},
  });
  // 实时吞吐量滑动窗口：每 10s 采样一次，保留最近 30 个点（约 5 分钟）
  const WINDOW_SIZE = 30;
  const POLL_INTERVAL = 10000;
  const [throughputHistory, setThroughputHistory] = useState<{ ts: number; value: number }[]>([]);
  const prevMsgRef = useRef<{ total: number; ts: number } | null>(null);

  const fetchSystemInfo = async () => {
    try {
      const res = await fetch(`${API_BASE}/monitor/system`);
      const data = await res.json();
      if (data.code === 0 || data.code === 200) {
        const info = data.data || {};
        setSystemInfo(info);
        // 基于累计消息数差值计算实时吞吐量（条/秒）
        const total: number = info.metrics?.['counter.system.total_messages'] || 0;
        const now = Date.now();
        const prev = prevMsgRef.current;
        if (prev) {
          const dt = (now - prev.ts) / 1000;
          const rate = dt > 0 ? Math.max(0, (total - prev.total) / dt) : 0;
          setThroughputHistory((h) => {
            const next = [...h, { ts: now, value: Math.round(rate) }];
            return next.length > WINDOW_SIZE ? next.slice(next.length - WINDOW_SIZE) : next;
          });
        }
        prevMsgRef.current = { total, ts: now };
      }
    } catch {
      // 降级
    }
  };

  useEffect(() => {
    fetchSystemInfo();
    const timer = setInterval(() => {
      fetchSystemInfo();
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  const totalMessages = systemInfo.metrics?.['counter.system.total_messages'] || 0;
  const activeListeners = systemInfo.active_listeners || 0;
  const activeDispatchers = systemInfo.active_dispatchers || 0;

  // 真实吞吐量曲线（来自累计消息数差值）
  const throughputData = throughputHistory.map((p) => p.value);
  const xLabels = throughputHistory.map((p) => {
    const d = new Date(p.ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  });

  const baseTextStyle = {
    fontFamily: 'Manrope, "LXGW WenKai", sans-serif',
    color: '#6f7d8c',
  };

  const throughputOption = {
    grid: { left: 50, right: 24, top: 20, bottom: 36 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fffdf7',
      borderColor: 'rgba(60,50,30,0.18)',
      borderWidth: 1,
      textStyle: {
        color: '#1a1f2a',
        fontFamily: 'LXGW WenKai, sans-serif',
        fontSize: 12,
      },
      axisPointer: { type: 'line', lineStyle: { color: '#0f5e4d', type: 'dashed' } },
    },
    xAxis: {
      type: 'category',
      data: xLabels,
      axisLine: { lineStyle: { color: 'rgba(60,50,30,0.18)' } },
      axisLabel: { ...baseTextStyle, fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { ...baseTextStyle, fontSize: 11 },
      splitLine: { lineStyle: { color: 'rgba(60,50,30,0.08)', type: 'dashed' } },
    },
    series: [
      {
        data: throughputData,
        type: 'line',
        smooth: 0.4,
        symbol: 'none',
        lineStyle: { color: '#0f5e4d', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15,94,77,0.28)' },
              { offset: 1, color: 'rgba(15,94,77,0)' },
            ],
          },
        },
      },
    ],
  };

  const resourceOption = {
    tooltip: {
      trigger: 'item',
      backgroundColor: '#fffdf7',
      borderColor: 'rgba(60,50,30,0.18)',
      borderWidth: 1,
      textStyle: {
        color: '#1a1f2a',
        fontFamily: 'LXGW WenKai, sans-serif',
        fontSize: 12,
      },
    },
    legend: {
      orient: 'horizontal',
      bottom: 0,
      textStyle: { ...baseTextStyle, fontSize: 12, color: '#3b4a5b' },
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 22,
    },
    series: [
      {
        type: 'pie',
        radius: ['58%', '78%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: '#fffdf7', borderWidth: 4 },
        data: [
          { value: activeListeners || 1, name: '监听器', itemStyle: { color: '#0f5e4d' } },
          { value: activeDispatchers || 1, name: '分发器', itemStyle: { color: '#b85c00' } },
          { value: 1, name: '处理器链', itemStyle: { color: '#3a4f7a' } },
        ],
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '38%',
        style: {
          text: String(activeListeners + activeDispatchers),
          fill: '#1a1f2a',
          fontFamily: 'Manrope, sans-serif',
          fontWeight: 700,
          fontSize: 36,
        },
      },
      {
        type: 'text',
        left: 'center',
        top: '56%',
        style: {
          text: '运行中',
          fill: '#6f7d8c',
          fontFamily: 'LXGW WenKai, sans-serif',
          fontSize: 13,
        },
      },
    ],
  };

  const events = [
    { ts: '15:42:18', level: '消息', src: '监听器·HTTP', msg: '已在 :8080 启动' },
    { ts: '15:42:18', level: '消息', src: '管道', msg: '已加载 0 条处理器链' },
    { ts: '15:42:18', level: '消息', src: '分发器', msg: '已订阅主题 *' },
    { ts: '15:39:02', level: '提示', src: '认证', msg: '环境变量未设 JWT 密钥，使用默认值' },
    { ts: '15:38:55', level: '消息', src: '系统', msg: '数据库已连接 · SQLite' },
  ];

  const levelColor = (lv: string) => {
    if (lv === '提示') return { color: 'var(--ochre)', bg: 'var(--ochre-soft)' };
    if (lv === '错误') return { color: 'var(--rouge)', bg: 'var(--rouge-soft)' };
    return { color: 'var(--pine)', bg: 'var(--pine-soft)' };
  };

  const avg = throughputData.length > 0
    ? Math.round(throughputData.reduce((a, b) => a + b, 0) / throughputData.length)
    : 0;
  const peak = throughputData.length > 0 ? Math.max(...throughputData) : 0;

  return (
    <Spin spinning={loading}>
      {/* 页面标题 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: 28,
        }}
      >
        <div>
          <div className="sg-eyebrow" style={{ marginBottom: 10 }}>
            控制平面 · 实时
          </div>
          <h1 className="sg-title">总览</h1>
          <p className="sg-subtitle">网关运行状态一览 · 每十秒自动刷新</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="sg-badge pine">
            <span className="sg-dot" />
            实时连接
          </div>
          <Tooltip title="手动刷新">
            <button
              onClick={fetchSystemInfo}
              style={{
                border: '1px solid var(--line-strong)',
                background: 'var(--paper-0)',
                color: 'var(--ink-1)',
                width: 36,
                height: 36,
                borderRadius: 8,
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                transition: 'all 180ms ease',
                fontSize: 15,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--pine)';
                e.currentTarget.style.color = 'var(--pine)';
                e.currentTarget.style.background = 'var(--pine-soft)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--line-strong)';
                e.currentTarget.style.color = 'var(--ink-1)';
                e.currentTarget.style.background = 'var(--paper-0)';
              }}
            >
              <ReloadOutlined />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* KPI 行 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 18,
          marginBottom: 24,
        }}
      >
        <Kpi
          label="累计消息数"
          value={formatNum(totalMessages)}
          unit="条"
          icon={<RiseOutlined />}
          color="var(--pine)"
          bg="var(--pine-soft)"
          hint="持续接收中"
        />
        <Kpi
          label="活跃监听器"
          value={activeListeners}
          unit="个"
          icon={<CloudServerOutlined />}
          color="var(--ochre)"
          bg="var(--ochre-soft)"
          hint="全部健康"
        />
        <Kpi
          label="活跃分发器"
          value={activeDispatchers}
          unit="个"
          icon={<SendOutlined />}
          color="var(--indigo)"
          bg="var(--indigo-soft)"
          hint="全部健康"
        />
        <Kpi
          label="系统状态"
          value="正常"
          icon={<ThunderboltOutlined />}
          color="var(--pine)"
          bg="var(--pine-soft)"
          hint="服务在线"
        />
      </div>

      {/* 图表行 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 18,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: 'var(--paper-0)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-lg)',
            padding: '20px 24px',
            boxShadow: 'var(--shadow-1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 12,
              paddingBottom: 12,
              borderBottom: '1px dashed var(--line-dash)',
            }}
          >
            <div>
              <div className="sg-eyebrow">实时采样 · 每 10 秒一次</div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 17,
                  color: 'var(--ink-0)',
                  marginTop: 6,
                }}
              >
                消息吞吐量
              </div>
            </div>
            <div style={{ display: 'flex', gap: 22, fontFamily: 'var(--font-han)', fontSize: 13 }}>
              <span style={{ color: 'var(--ink-2)' }}>
                平均&nbsp;
                <span className="sg-num" style={{ color: 'var(--ink-0)' }}>{avg}</span>
                <span style={{ color: 'var(--ink-3)' }}> 条/秒</span>
              </span>
              <span style={{ color: 'var(--ink-2)' }}>
                峰值&nbsp;
                <span className="sg-num" style={{ color: 'var(--pine)' }}>{peak}</span>
                <span style={{ color: 'var(--ink-3)' }}> 条/秒</span>
              </span>
            </div>
          </div>
          {throughputData.length === 0 ? (
            <div style={{ height: 280, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontFamily: 'var(--font-han)', fontSize: 13 }}>
              正在采集实时数据，请稍候…
            </div>
          ) : (
            <ReactECharts option={throughputOption} style={{ height: 280 }} />
          )}
        </div>

        <div
          style={{
            background: 'var(--paper-0)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-lg)',
            padding: '20px 24px',
            boxShadow: 'var(--shadow-1)',
          }}
        >
          <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px dashed var(--line-dash)' }}>
            <div className="sg-eyebrow">资源构成</div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 17,
                color: 'var(--ink-0)',
                marginTop: 6,
              }}
            >
              组件分布
            </div>
          </div>
          <ReactECharts option={resourceOption} style={{ height: 280 }} />
        </div>
      </div>

      {/* 事件流 */}
      <div
        style={{
          background: 'var(--paper-0)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-lg)',
          padding: '20px 24px',
          boxShadow: 'var(--shadow-1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 14,
            paddingBottom: 12,
            borderBottom: '1px dashed var(--line-dash)',
          }}
        >
          <div>
            <div className="sg-eyebrow">事件追踪</div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 17,
                color: 'var(--ink-0)',
                marginTop: 6,
              }}
            >
              系统日志流
            </div>
          </div>
          <span className="sg-badge">最近 50 条</span>
        </div>
        <div
          style={{
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {events.map((e, i) => {
            const lc = levelColor(e.level);
            return (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 70px 150px 1fr',
                  gap: 14,
                  padding: '12px 4px',
                  alignItems: 'center',
                  borderBottom: i < events.length - 1 ? '1px dashed var(--line-dash)' : 'none',
                  fontFamily: 'var(--font-han)',
                  fontSize: 13,
                  color: 'var(--ink-1)',
                }}
              >
                <span
                  className="sg-num"
                  style={{ color: 'var(--ink-3)', fontSize: 12 }}
                >
                  {e.ts}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2px 10px',
                    borderRadius: 4,
                    color: lc.color,
                    background: lc.bg,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {e.level}
                </span>
                <span style={{ color: 'var(--ink-2)' }}>{e.src}</span>
                <span>{e.msg}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Spin>
  );
};

export default Dashboard;
