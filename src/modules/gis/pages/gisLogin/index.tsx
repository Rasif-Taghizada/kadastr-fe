import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Tabs, Typography, Flex } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogoSmall } from '@/assets/icons';
import AppButton from '@/common/components/shared/button';
import { gisLoginService, gisRegisterService } from '@/common/libs/services/gisAuthService';
import { openNotification } from '@/common/components/shared/notification';
import type { GisLoginData, GisRegisterData } from '@/common/types';

const { Title } = Typography;

const GisLogin: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('gis_access_token');
    if (token) navigate('/gis/map', { replace: true });
  }, [navigate]);

  const handleLogin = async (values: GisLoginData) => {
    setIsLoading(true);
    try {
      const { accessToken, user } = await gisLoginService(values);
      localStorage.setItem('gis_access_token', accessToken);
      localStorage.setItem('gis_user', JSON.stringify(user));
      navigate('/gis/map', { replace: true });
    } catch (err) {
      console.error('GIS login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (values: GisRegisterData & { confirmPassword: string }) => {
    if (values.password !== values.confirmPassword) {
      openNotification({
        type: 'error',
        title: t('auth.register'),
        content: t('gis.passwords_not_match'),
      });
      return;
    }

    setIsLoading(true);
    try {
      const { accessToken, user } = await gisRegisterService({
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
      });
      localStorage.setItem('gis_access_token', accessToken);
      localStorage.setItem('gis_user', JSON.stringify(user));
      navigate('/gis/map', { replace: true });
    } catch (err) {
      console.error('GIS register error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loginTab = (
    <Form form={loginForm} layout="vertical" onFinish={handleLogin} style={{ marginTop: 16 }}>
      <Form.Item
        name="email"
        rules={[
          { required: true, message: t('auth.please_input_email') },
          { type: 'email', message: t('gis.invalid_email') },
        ]}
      >
        <Input placeholder={t('auth.email_address')} size="large" disabled={isLoading} />
      </Form.Item>

      <Form.Item
        name="password"
        rules={[{ required: true, message: t('auth.please_input_password') }]}
      >
        <Input.Password placeholder={t('auth.password')} size="large" disabled={isLoading} />
      </Form.Item>

      <Form.Item style={{ marginBottom: 0 }}>
        <AppButton
          type="submit"
          variant="primary"
          size="md"
          loading={isLoading}
          style={{ width: '100%' }}
        >
          {isLoading ? t('auth.loading') : t('auth.login')}
        </AppButton>
      </Form.Item>
    </Form>
  );

  const registerTab = (
    <Form form={registerForm} layout="vertical" onFinish={handleRegister} style={{ marginTop: 16 }}>
      <Flex gap={8}>
        <Form.Item
          name="firstName"
          style={{ flex: 1 }}
          rules={[{ required: true, message: t('gis.required') }]}
        >
          <Input placeholder={t('gis.first_name')} size="large" disabled={isLoading} />
        </Form.Item>
        <Form.Item
          name="lastName"
          style={{ flex: 1 }}
          rules={[{ required: true, message: t('gis.required') }]}
        >
          <Input placeholder={t('gis.last_name')} size="large" disabled={isLoading} />
        </Form.Item>
      </Flex>

      <Form.Item
        name="email"
        rules={[
          { required: true, message: t('auth.please_input_email') },
          { type: 'email', message: t('gis.invalid_email') },
        ]}
      >
        <Input placeholder={t('auth.email_address')} size="large" disabled={isLoading} />
      </Form.Item>

      <Form.Item
        name="password"
        rules={[
          { required: true, message: t('auth.please_input_password') },
          { min: 6, message: t('gis.password_min_length') },
        ]}
      >
        <Input.Password placeholder={t('auth.password')} size="large" disabled={isLoading} />
      </Form.Item>

      <Form.Item
        name="confirmPassword"
        rules={[{ required: true, message: t('auth.please_input_confirm_password') }]}
      >
        <Input.Password placeholder={t('auth.confirm_password')} size="large" disabled={isLoading} />
      </Form.Item>

      <Form.Item style={{ marginBottom: 0 }}>
        <AppButton
          type="submit"
          variant="primary"
          size="md"
          loading={isLoading}
          style={{ width: '100%' }}
        >
          {isLoading ? t('auth.loading') : t('auth.register')}
        </AppButton>
      </Form.Item>
    </Form>
  );

  return (
    <div className="auth">
      <Card className="auth__card" style={{ width: 420 }}>
        <Flex align="center" justify="center" gap={10}>
          <LogoSmall />
          <Title level={4}>GIS {t('gis.app_name')}</Title>
        </Flex>

        <Tabs
          centered
          style={{ marginTop: 16 }}
          items={[
            { key: 'login', label: t('auth.login'), children: loginTab },
            { key: 'register', label: t('auth.register'), children: registerTab },
          ]}
        />
      </Card>
    </div>
  );
};

export default GisLogin;
