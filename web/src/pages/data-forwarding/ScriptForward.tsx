import React, { useState, useEffect } from 'react';
import { message, Modal, Form, Input } from 'antd';
import ScriptPageLayout, { ScriptItem } from '../../components/ScriptPageLayout';
import { 
  getPushScripts, 
  createPushScript, 
  updatePushScript, 
  deletePushScript, 
  enablePushScript, 
  disablePushScript,
  PushScript 
} from '../../services/scriptApi';

const ScriptForward: React.FC = () => {
  const [data, setData] = useState<ScriptItem[]>([]);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForm] = Form.useForm();
  
  const loadData = async () => {
    try {
      const list = await getPushScripts();
      const items: ScriptItem[] = list.map(item => ({
        id: item.id.toString(),
        name: item.name,
        enabled: item.enable,
        script: item.content
      }));
      setData(items);
    } catch (error: any) {
      message.error('Failed to load scripts: ' + error.message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveToApi = async (item: ScriptItem, isToggle: boolean = false) => {
    try {
      if (isToggle) {
         if (item.enabled) {
            await enablePushScript(parseInt(item.id));
         } else {
            await disablePushScript(parseInt(item.id));
         }
         message.success(item.enabled ? 'Enabled' : 'Disabled');
      } else {
         await updatePushScript({
            id: parseInt(item.id),
            name: item.name,
            content: item.script,
            enable: item.enabled
         });
         message.success('Saved successfully');
      }
      // Reload to ensure sync? Or just rely on local state if success
    } catch (error: any) {
      message.error('Operation failed: ' + error.message);
      // Revert on error? For now simple error message
    }
  };

  const handleCreate = () => {
    createForm.resetFields();
    setCreateModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
        await deletePushScript(parseInt(id));
        setData(prev => prev.filter(item => item.id !== id));
        message.success('Deleted successfully');
    } catch (error: any) {
        message.error('Delete failed: ' + error.message);
    }
  };

  const handleCreateSubmit = () => {
    createForm.validateFields().then(async values => {
      try {
          await createPushScript({ name: values.name });
          message.success('Created successfully');
          setCreateModalVisible(false);
          loadData();
      } catch (error: any) {
          message.error('Create failed: ' + error.message);
      }
    });
  };

  return (
    <>
      <ScriptPageLayout
        title="Forward Scripts"
        items={data}
        onSelect={(item) => {}}
        onUpdate={(item) => {
            const original = data.find(d => d.id === item.id);
            // Update local state first
            setData(prev => prev.map(p => p.id === item.id ? item : p));
            
            // If enabled status changed, trigger API immediately
            if (original && original.enabled !== item.enabled) {
                 saveToApi(item, true);
            }
        }}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onSave={(item) => saveToApi(item, false)}
        placeholder="Select a script to edit..."
      />
      <Modal
        title="New Forward Script"
        open={createModalVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateModalVisible(false)}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label="Script Name" rules={[{ required: true, message: 'Please input name' }]}>
            <Input placeholder="e.g. custom_forward.go" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default ScriptForward;
