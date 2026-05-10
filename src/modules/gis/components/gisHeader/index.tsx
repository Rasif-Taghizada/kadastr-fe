import React, { useState, useEffect } from 'react';
import { Button, Dropdown, Typography, Tooltip } from 'antd';
import { LogoutOutlined, UserOutlined, GlobalOutlined } from '@ant-design/icons';
import { LogoSmall } from '@/assets/icons';
import { useTranslation } from 'react-i18next';
import { gisLogoutService, gisGetMeService } from '@/common/libs/services/gisAuthService';

const { Text } = Typography;

const LANGUAGES = [
  { key: 'az', label: 'AZ' },
  { key: 'en', label: 'EN' },
  { key: 'ru', label: 'RU' },
];

const GisHeader: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    gisGetMeService()
      .then((user) => {
        if (user) {
          const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
          setUserName(name || user.email || '');
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      await gisLogoutService();
    } catch {
      // ignore — still clear local state
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      window.location.href = '/auth/signin';
    }
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('lang', lang);
  };

  const currentLang = LANGUAGES.find((l) => l.key === i18n.language) ?? LANGUAGES[0];

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 48,
        zIndex: 2000,
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(6px)',
        boxShadow: '0 1px 6px rgba(0,0,0,0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        gap: 12,
      }}
    >
      {/* Left: logo + app name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <LogoSmall style={{ width: 28, height: 28 }} />
        <Text strong style={{ fontSize: 14, whiteSpace: 'nowrap' }}>
          GIS {t('gis.app_name')}
        </Text>
      </div>

      {/* Right: language + user + logout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Dropdown
          menu={{
            items: LANGUAGES.map((l) => ({
              key: l.key,
              label: l.label,
              onClick: () => handleLanguageChange(l.key),
            })),
            selectedKeys: [i18n.language],
          }}
          trigger={['click']}
        >
          <Button
            type="text"
            icon={<GlobalOutlined />}
            size="small"
            style={{ fontSize: 12 }}
          >
            {currentLang.label}
          </Button>
        </Dropdown>

        {userName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserOutlined style={{ color: '#666', fontSize: 13 }} />
            <Text style={{ fontSize: 12, color: '#555', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userName}
            </Text>
          </div>
        )}

        <Tooltip title={t('header.logout')}>
          <Button
            type="text"
            danger
            icon={<LogoutOutlined />}
            size="small"
            onClick={handleLogout}
          >
            {t('header.logout')}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

export default GisHeader;
