import React from 'react';
import {
  FormControl,
  Select,
  MenuItem,
  SelectChangeEvent,
  Box,
} from '@mui/material';
import { LightMode, DarkMode, SettingsBrightness } from '@mui/icons-material';
import { useTheme, ThemeMode } from '../contexts/ThemeContext';

const ThemeSelector: React.FC = () => {
  const { mode, setMode } = useTheme();

  const handleChange = (event: SelectChangeEvent<ThemeMode>) => {
    setMode(event.target.value as ThemeMode);
  };

  const getIcon = (themeMode: ThemeMode) => {
    switch (themeMode) {
      case 'light':
        return <LightMode fontSize="small" />;
      case 'dark':
        return <DarkMode fontSize="small" />;
      case 'system':
        return <SettingsBrightness fontSize="small" />;
      default:
        return <SettingsBrightness fontSize="small" />;
    }
  };

  const getLabel = (themeMode: ThemeMode) => {
    switch (themeMode) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      case 'system':
        return 'System';
      default:
        return 'System';
    }
  };

  return (
    <FormControl size="small" sx={{ minWidth: 120 }}>
      <Select
        value={mode}
        onChange={handleChange}
        displayEmpty
        sx={{
          '& .MuiSelect-select': {
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          },
        }}
      >
        <MenuItem value="light">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getIcon('light')}
            {getLabel('light')}
          </Box>
        </MenuItem>
        <MenuItem value="dark">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getIcon('dark')}
            {getLabel('dark')}
          </Box>
        </MenuItem>
        <MenuItem value="system">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getIcon('system')}
            {getLabel('system')}
          </Box>
        </MenuItem>
      </Select>
    </FormControl>
  );
};

export default ThemeSelector;
