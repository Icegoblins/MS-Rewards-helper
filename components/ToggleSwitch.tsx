
import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string; // 可选的右侧文字
  disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, label, disabled = false }) => {
  return (
    <label className={`inline-flex items-center cursor-pointer group ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <input 
        type="checkbox" 
        className="sr-only peer" 
        checked={checked} 
        onChange={(e) => !disabled && onChange(e.target.checked)} 
        disabled={disabled}
      />
      <div className={`
        relative w-11 h-6 rounded-full peer 
        transition-colors duration-300 ease-in-out
        bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50
        peer-checked:bg-blue-600
        after:content-[''] 
        after:absolute 
        after:top-[2px] 
        after:left-[2px] 
        after:bg-white 
        after:border-gray-300 
        after:border 
        after:rounded-full 
        after:h-5 
        after:w-5 
        after:transition-all 
        after:duration-300
        after:shadow-sm
        peer-checked:after:translate-x-full 
        peer-checked:after:border-white
        group-hover:after:scale-95
      `}></div>
      {label && <span className="ml-3 text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{label}</span>}
    </label>
  );
};

export default ToggleSwitch;
