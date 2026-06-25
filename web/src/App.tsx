import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DeviceList from './pages/data-collection/DeviceList';
import NodeList from './pages/data-collection/NodeList';
import ProtocolManager from './pages/data-collection/ProtocolManager';
import MqttForward from './pages/data-forwarding/MqttForward';
import HttpForward from './pages/data-forwarding/HttpForward';
import ScriptForward from './pages/data-forwarding/ScriptForward';
import ScriptManager from './pages/scripts/ScriptManager';
import ScriptCollection from './pages/scripts/ScriptCollection';
import SshClient from './pages/system/SshClient';
import GlobalConfig from './pages/system/GlobalConfig';
import PluginManager from './pages/system/PluginManager';
import HttpListener from './pages/data-listener/HttpListener';
import MqttListener from './pages/data-listener/MqttListener';
import TcpListener from './pages/data-listener/TcpListener';
import UdpListener from './pages/data-listener/UdpListener';
import SerialListener from './pages/data-listener/SerialListener';
import ScriptListener from './pages/data-listener/ScriptListener';
import DataParser from './pages/data-listener/DataParser';
import DataMonitor from './pages/data-monitor/DataMonitor';
import MessageQueue from './pages/data-monitor/MessageQueue';
import ProcessorChainManager from './pages/unified/ProcessorChainManager';
import DispatcherManager from './pages/unified/DispatcherManager';
import DataFlowCanvas from './pages/data-flow/DataFlowCanvas';
import useUserStore from './store/useUserStore';

const App: React.FC = () => {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  return (
    <Router>
      <Routes>
        {!isAuthenticated && (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        )}
        {isAuthenticated && (
          <>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="data">
                <Route path="monitor" element={<DataMonitor />} />
                <Route path="queue" element={<MessageQueue />} />
              </Route>
              <Route path="unified">
                <Route path="processor-chains" element={<ProcessorChainManager />} />
                <Route path="dispatchers" element={<DispatcherManager />} />
                <Route path="data-flow" element={<DataFlowCanvas />} />
              </Route>
              <Route path="data-listener">
                <Route path="http" element={<HttpListener />} />
                <Route path="mqtt" element={<MqttListener />} />
                <Route path="tcp" element={<TcpListener />} />
                <Route path="udp" element={<UdpListener />} />
                <Route path="serial" element={<SerialListener />} />
                <Route path="script" element={<ScriptListener />} />
                <Route path="parser" element={<DataParser />} />
              </Route>
              <Route path="scripts">
                <Route path="collection" element={<ScriptCollection />} />
                <Route path="services" element={<ScriptCollection />} />
                <Route path="manager" element={<ScriptManager />} />
              </Route>
              <Route path="data-collection">
                <Route path="devices" element={<DeviceList />} />
                <Route path="nodes" element={<NodeList />} />
                <Route path="protocols" element={<ProtocolManager />} />
              </Route>
              <Route path="data-forwarding">
                <Route path="mqtt" element={<MqttForward />} />
                <Route path="http" element={<HttpForward />} />
                <Route path="scripts" element={<ScriptForward />} />
              </Route>
              <Route path="system">
                <Route path="ssh" element={<SshClient />} />
                <Route path="config" element={<GlobalConfig />} />
                <Route path="plugins" element={<PluginManager />} />
              </Route>
            </Route>
          </>
        )}
      </Routes>
    </Router>
  );
};

export default App;
