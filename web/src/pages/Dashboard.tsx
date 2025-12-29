import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, Col, Row, Statistic } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

const Dashboard: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [deviceCount, setDeviceCount] = useState(112);
  const [messageRate, setMessageRate] = useState(930);
  const [systemStartTime] = useState(new Date(Date.now() - 12 * 24 * 60 * 60 * 1000)); // 12天前启动

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
      setDeviceCount(Math.floor(Math.random() * 50) + 100);
      setMessageRate(Math.floor(Math.random() * 200) + 800);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const calculateUptime = () => {
    const diff = currentTime.getTime() - systemStartTime.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const cpuOption = {
    title: { text: 'CPU 使用率' },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'] },
    yAxis: { type: 'value', max: 100 },
    series: [{ data: [12, 15, 45, 32, 20, 15], type: 'line', smooth: true }]
  };

  const memOption = {
    title: { text: '内存使用率' },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'] },
    yAxis: { type: 'value', max: 100 },
    series: [{ data: [40, 42, 45, 48, 50, 42], type: 'line', smooth: true, areaStyle: {} }]
  };

  return (
    <div className="site-card-wrapper">
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="活跃设备"
              value={deviceCount}
              precision={0}
              valueStyle={{ color: '#3f8600' }}
              prefix={<ArrowUpOutlined />}
              suffix=""
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="消息数/秒"
              value={messageRate}
              precision={0}
              valueStyle={{ color: '#cf1322' }}
              prefix={<ArrowUpOutlined />}
              suffix=""
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="系统运行时间"
              value={calculateUptime()}
              valueStyle={{ color: '#000' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="CPU History">
            <ReactECharts option={cpuOption} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Memory History">
            <ReactECharts option={memOption} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
