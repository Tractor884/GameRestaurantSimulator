'use client';

/**
 * Точка входа игры (единственный роут /).
 * Нет сохранения → визард открытия; есть → игровой shell.
 */
import { useEffect, useState } from 'react';
import { useGame, tryRestore } from '@/lib/game/store/gameStore';
import { SetupWizard } from '@/components/game/SetupWizard';
import { GameShell } from '@/components/game/GameShell';
import { Toaster } from '@/components/ui/sonner';

export default function Page() {
  const state = useGame((s) => s.state);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    // Восстановление автосейва при загрузке (ТЗ §32.1).
    tryRestore();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- одноразовый сброс экрана загрузки после чтения localStorage
    setRestored(true);
  }, []);

  if (!restored) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-stone-400 animate-pulse text-lg">Загрузка ресторана…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {state ? <GameShell /> : <SetupWizard />}
      <Toaster position="bottom-right" richColors duration={3500} />
    </div>
  );
}
