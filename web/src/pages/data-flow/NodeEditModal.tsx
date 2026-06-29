import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Form, message, Empty, Spin } from 'antd';
import {
  createListenerParent, updateListenerParent,
  createListenerConn, updateListenerConn,
} from '../../services/dataFlowApi';
import {
  getSchema, flattenToForm, buildFromForm,
  type NodeKind,
} from './fieldSchema';
import { FieldRenderer } from './FieldRenderer';

export interface ModalTarget {
  kind: NodeKind;
  type: string;          // http_server / http_route / ...
  mode: 'create' | 'edit';
  node?: any;            // edit 时传入完整节点
  parentId?: number;     // listener conn 创建时需要
}

interface Props {
  target: ModalTarget | null;
  onClose: () => void;
  onSaved: () => void;
}

// schema 驱动完整编辑 Modal
// 横切阶段仅 listener 类型走此 Modal；其余 kind 仍保留原流程
export const NodeEditModal: React.FC<Props> = ({ target, onClose, onSaved }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  const schema = useMemo(
    () => (target ? getSchema(target.kind, target.type) : undefined),
    [target],
  );

  useEffect(() => {
    if (!target) return;
    setReady(false);
    if (target.mode === 'edit' && target.node) {
      const vals = flattenToForm(target.kind, target.type, target.node);
      form.setFieldsValue(vals);
    } else if (target.mode === 'create' && schema) {
      const defaults: Record<string, any> = {};
      for (const f of schema.fields) {
        defaults[f.key] = f.default ?? (f.type === 'switch' ? false : '');
      }
      form.setFieldsValue(defaults);
    }
    setReady(true);
  }, [target, schema, form]);

  const title = useMemo(() => {
    if (!target) return '';
    const action = target.mode === 'create' ? '新建' : '编辑';
    const typeName = target.type || target.kind;
    return `${action} ${typeName}`;
  }, [target]);

  const handleSave = async () => {
    if (!target || !schema) return;
    setSaving(true);
    try {
      const values = await form.validateFields();
      if (target.kind === 'listenerParent') {
        if (target.mode === 'create') {
          await createListenerParent(
            buildFromForm(target.kind, target.type, values, { type: target.type, enable: false }) as any,
          );
        } else {
          await updateListenerParent(
            buildFromForm(target.kind, target.type, values, {
              id: target.node.id,
              type: target.node.type,
              enable: target.node.enable,
            }) as any,
          );
        }
      } else if (target.kind === 'listener') {
        const base =
          target.mode === 'create'
            ? { parent_id: target.parentId ?? 0, type: target.type, enable: false, topic: '', out_topic: '' }
            : { id: target.node.id, parent_id: target.node.parent_id, type: target.node.type, enable: target.node.enable };
        const built = buildFromForm(target.kind, target.type, values, base) as any;
        // topic/out_topic 是独立列，从表单值同步到顶层
        built.topic = values.topic ?? '';
        built.out_topic = values.out_topic ?? '';
        if (target.mode === 'create') {
          await createListenerConn(built);
        } else {
          await updateListenerConn(built);
        }
      }
      message.success(target.mode === 'create' ? '创建成功' : '保存成功');
      onSaved();
      onClose();
    } catch (e: any) {
      if (e?.errorFields) return; // 校验错误，不弹消息
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={title}
      open={!!target}
      onCancel={onClose}
      onOk={handleSave}
      okButtonProps={{ loading: saving }}
      cancelButtonProps={{ disabled: saving }}
      destroyOnClose
      maskClosable={false}
      width={560}
    >
      {!target ? null : !schema ? (
        <Empty description="该类型暂不支持高级编辑" />
      ) : (
        <Spin spinning={!ready}>
          <Form form={form} layout="vertical" disabled={saving}>
            {schema.fields.map(f => (
              <FieldRenderer key={f.key} spec={f} form={form} />
            ))}
          </Form>
        </Spin>
      )}
    </Modal>
  );
};
