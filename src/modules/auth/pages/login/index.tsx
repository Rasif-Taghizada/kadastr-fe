import { Card, Flex, Form, Input, Tabs } from 'antd';
import Title from 'antd/es/typography/Title';
import { LogoSmall } from '@/assets/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppButton from '@/common/components/shared/button';
import { gisLoginService, gisRegisterService } from '@/common/libs/services/gisAuthService';
import { openNotification } from '@/common/components/shared/notification';
import styles from '@/modules/auth/components/loginForm/index.module.css';

const Login = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isRegisterLoading, setIsRegisterLoading] = useState(false);

  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();

  const presetEmail = useMemo(() => {
    const raw = searchParams.get('first-loginattempBy');
    return raw?.trim() || undefined;
  }, [searchParams]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) navigate('/', { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (presetEmail) loginForm.setFieldsValue({ email: presetEmail });
  }, [presetEmail, loginForm]);

  const handleLogin = async (values: { email: string; password: string }) => {
    setIsLoginLoading(true);
    try {
      const { accessToken } = await gisLoginService(values);
      localStorage.setItem('access_token', accessToken);
      window.location.href = '/';
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleRegister = async (values: { firstName: string; lastName: string; email: string; password: string; confirmPassword: string }) => {
    if (values.password !== values.confirmPassword) {
      openNotification({ type: 'error', title: t('auth.register'), content: t('gis.passwords_not_match') });
      return;
    }
    setIsRegisterLoading(true);
    try {
      const { accessToken } = await gisRegisterService({
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
      });
      localStorage.setItem('access_token', accessToken);
      window.location.href = '/';
    } catch (err) {
      console.error('Register error:', err);
    } finally {
      setIsRegisterLoading(false);
    }
  };

  const loginTab = (
    <Form
      form={loginForm}
      name="login"
      layout="vertical"
      initialValues={{ email: presetEmail, remember: true }}
      onFinish={handleLogin}
      className={styles.form}
    >
      <Form.Item name="email" rules={[{ required: true, message: t('auth.please_input_email') }]}>
        <Input placeholder={t('auth.email_address')} className={styles.input} disabled={isLoginLoading} />
      </Form.Item>

      <Form.Item name="password" rules={[{ required: true, message: t('auth.please_input_password') }]}>
        <Input.Password className={styles.input} placeholder={t('auth.password')} disabled={isLoginLoading} />
      </Form.Item>

      <Form.Item>
        <AppButton type="submit" loading={isLoginLoading} variant="primary" size="md" className={styles.button}>
          {isLoginLoading ? t('auth.loading') : t('auth.login')}
        </AppButton>
      </Form.Item>

      <Flex align="center" justify="center">
        <p>{t('auth.all_rights_reserved')}</p>
      </Flex>
    </Form>
  );

  const registerTab = (
    <Form form={registerForm} layout="vertical" onFinish={handleRegister} className={styles.form}>
      <Flex gap={8}>
        <Form.Item name="firstName" style={{ flex: 1 }} rules={[{ required: true, message: t('gis.required') }]}>
          <Input placeholder={t('gis.first_name')} className={styles.input} disabled={isRegisterLoading} />
        </Form.Item>
        <Form.Item name="lastName" style={{ flex: 1 }} rules={[{ required: true, message: t('gis.required') }]}>
          <Input placeholder={t('gis.last_name')} className={styles.input} disabled={isRegisterLoading} />
        </Form.Item>
      </Flex>

      <Form.Item
        name="email"
        rules={[
          { required: true, message: t('auth.please_input_email') },
          { type: 'email', message: t('gis.invalid_email') },
        ]}
      >
        <Input placeholder={t('auth.email_address')} className={styles.input} disabled={isRegisterLoading} />
      </Form.Item>

      <Form.Item
        name="password"
        rules={[
          { required: true, message: t('auth.please_input_password') },
          { min: 6, message: t('gis.password_min_length') },
        ]}
      >
        <Input.Password className={styles.input} placeholder={t('auth.password')} disabled={isRegisterLoading} />
      </Form.Item>

      <Form.Item name="confirmPassword" rules={[{ required: true, message: t('auth.please_input_confirm_password') }]}>
        <Input.Password className={styles.input} placeholder={t('auth.confirm_password')} disabled={isRegisterLoading} />
      </Form.Item>

      <Form.Item>
        <AppButton type="submit" loading={isRegisterLoading} variant="primary" size="md" className={styles.button}>
          {isRegisterLoading ? t('auth.loading') : t('auth.register')}
        </AppButton>
      </Form.Item>

      <Flex align="center" justify="center">
        <p>{t('auth.all_rights_reserved')}</p>
      </Flex>
    </Form>
  );

  return (
    <div className="auth">
      <Card className="auth__card">
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

export default Login;
