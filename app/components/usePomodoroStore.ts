import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TimerMode = 'work' | 'break';
export type TimerState = 'idle' | 'running' | 'paused';

interface PomodoroSettings {
  workMinutes: number;
  breakMinutes: number;
  autoStartBreak: boolean;
  autoStartWork: boolean;
  soundEnabled: boolean;
}

interface PomodoroStore {
  // Timer state
  mode: TimerMode;
  state: TimerState;
  secondsRemaining: number;
  
  // Settings
  settings: PomodoroSettings;
  
  // Visibility
  isVisible: boolean;
  isExpanded: boolean;
  
  // Actions
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  toggleMode: () => void;
  setSecondsRemaining: (seconds: number) => void;
  updateSettings: (settings: Partial<PomodoroSettings>) => void;
  toggleVisibility: () => void;
  toggleExpanded: () => void;
}

export const usePomodoroStore = create<PomodoroStore>()(
  persist(
    (set, get) => ({
      // Initial state
      mode: 'work',
      state: 'idle',
      secondsRemaining: 25 * 60, // 25 minutes default
      
      settings: {
        workMinutes: 25,
        breakMinutes: 5,
        autoStartBreak: false,
        autoStartWork: false,
        soundEnabled: true,
      },
      
      isVisible: true,
      isExpanded: false,
      
      // Actions
      start: () => set({ state: 'running' }),
      
      pause: () => set({ state: 'paused' }),
      
      reset: () => {
        const { mode, settings } = get();
        const minutes = mode === 'work' ? settings.workMinutes : settings.breakMinutes;
        set({ 
          state: 'idle', 
          secondsRemaining: minutes * 60 
        });
      },
      
      skip: () => {
        const { mode, settings } = get();
        const newMode: TimerMode = mode === 'work' ? 'break' : 'work';
        const minutes = newMode === 'work' ? settings.workMinutes : settings.breakMinutes;
        const shouldAutoStart = newMode === 'work' ? settings.autoStartWork : settings.autoStartBreak;
        
        set({ 
          mode: newMode,
          secondsRemaining: minutes * 60,
          state: shouldAutoStart ? 'running' : 'idle'
        });
      },
      
      toggleMode: () => {
        const { mode, settings } = get();
        const newMode: TimerMode = mode === 'work' ? 'break' : 'work';
        const minutes = newMode === 'work' ? settings.workMinutes : settings.breakMinutes;
        
        set({ 
          mode: newMode,
          secondsRemaining: minutes * 60,
          state: 'idle'
        });
      },
      
      setSecondsRemaining: (seconds: number) => {
        set({ secondsRemaining: Math.max(0, seconds) });
        
        // Handle timer completion
        if (seconds <= 0) {
          const { mode, settings } = get();
          const newMode: TimerMode = mode === 'work' ? 'break' : 'work';
          const minutes = newMode === 'work' ? settings.workMinutes : settings.breakMinutes;
          const shouldAutoStart = newMode === 'work' ? settings.autoStartWork : settings.autoStartBreak;
          
          // Play sound if enabled
          if (settings.soundEnabled) {
            // Generate a pleasant notification sound using Web Audio API
            try {
              const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
              
              // Create three beeps with increasing pitch
              [0, 0.15, 0.3].forEach((delay, i) => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                // Pleasant frequencies: C5, E5, G5 (major chord)
                oscillator.frequency.value = [523.25, 659.25, 783.99][i];
                oscillator.type = 'sine';
                
                // Envelope: quick attack, smooth release
                const startTime = audioContext.currentTime + delay;
                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
                
                oscillator.start(startTime);
                oscillator.stop(startTime + 0.15);
              });
            } catch (e) {
              console.log('Could not play sound:', e);
            }
          }
          
          // Show browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(
              mode === 'work' ? 'Work session complete!' : 'Break complete!',
              {
                body: newMode === 'work' ? 'Time to get back to work' : 'Time for a break',
                icon: '/pomodoro-icon.png',
                tag: 'pomodoro'
              }
            );
          }
          
          set({ 
            mode: newMode,
            secondsRemaining: minutes * 60,
            state: shouldAutoStart ? 'running' : 'idle'
          });
        }
      },
      
      updateSettings: (newSettings: Partial<PomodoroSettings>) => {
        const { settings } = get();
        set({ settings: { ...settings, ...newSettings } });
      },
      
      toggleVisibility: () => set((state) => ({ isVisible: !state.isVisible })),
      
      toggleExpanded: () => set((state) => ({ isExpanded: !state.isExpanded })),
    }),
    {
      name: 'pomodoro-storage',
      // Only persist settings and visibility, not active timer state
      partialize: (state) => ({
        settings: state.settings,
        isVisible: state.isVisible,
      }),
    }
  )
);
