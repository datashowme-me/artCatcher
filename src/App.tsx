import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CameraAngle, GameState, PrizeMetadata, CollectionItem, GameStats } from './types';
import { PRIZES, INITIAL_ACHIEVEMENTS } from './utils/artData';
import { sound } from './utils/audio';
import { ClawMachineGame } from './game/threeClawMachine';
import { Header } from './components/Header';
import { ArcadeControls } from './components/ArcadeControls';
import { PrizeModal } from './components/PrizeModal';
import { GalleryModal } from './components/GalleryModal';
import { AchievementsModal } from './components/AchievementsModal';
import { HowToPlayModal } from './components/HowToPlayModal';
import { Sparkles, AlertCircle } from 'lucide-react';

const STORAGE_KEYS = {
  COINS: 'artclaw_coins_v1',
  COLLECTION: 'artclaw_collection_v1',
  STATS: 'artclaw_stats_v1',
  ACHIEVEMENTS: 'artclaw_claimed_achievements_v1',
};

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ClawMachineGame | null>(null);

  // Game & Economy State
  const [gameState, setGameState] = useState<GameState>('IDLE');
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>('FRONT');
  const [coins, setCoins] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.COINS);
    return saved !== null ? parseInt(saved, 10) : 6;
  });

  const [collection, setCollection] = useState<Record<string, CollectionItem>>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.COLLECTION);
    return saved ? JSON.parse(saved) : {};
  });

  const [stats, setStats] = useState<GameStats>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STATS);
    return saved
      ? JSON.parse(saved)
      : {
          totalAttempts: 0,
          totalCatches: 0,
          distinctPrizesCaught: 0,
          coinsSpent: 0,
          consecutiveMisses: 0,
          viewAnglesSwitched: 0,
        };
  });

  const [claimedAchievements, setClaimedAchievements] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS);
    return saved ? JSON.parse(saved) : [];
  });

  // 3D Aiming & Targeting State
  const [clawCoords, setClawCoords] = useState<{ x: number; z: number; normX: number; normZ: number }>({
    x: 0,
    z: 0,
    normX: 0,
    normZ: 0,
  });
  const [lockedPrize, setLockedPrize] = useState<PrizeMetadata | null>(null);

  // Modal Dialogs
  const [wonPrize, setWonPrize] = useState<PrizeMetadata | null>(null);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.COINS, coins.toString());
  }, [coins]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.COLLECTION, JSON.stringify(collection));
  }, [collection]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(claimedAchievements));
  }, [claimedAchievements]);

  const showNotice = (msg: string) => {
    setNoticeMessage(msg);
    setTimeout(() => {
      setNoticeMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  // Initialize Claw Machine Game
  useEffect(() => {
    if (!mountRef.current) return;

    const game = new ClawMachineGame(mountRef.current, {
      onStateChange: (state) => {
        setGameState(state);
      },
      onPrizeWon: (prize) => {
        setWonPrize(prize);

        // Update collection
        setCollection((prev) => {
          const currentCount = prev[prize.id]?.caughtCount || 0;
          return {
            ...prev,
            [prize.id]: {
              prizeId: prize.id,
              caughtCount: currentCount + 1,
              firstCaughtAt: prev[prize.id]?.firstCaughtAt || Date.now(),
            },
          };
        });

        // Update stats & reward coins (+2 on win)
        setStats((prev) => {
          const distinct = new Set([...Object.keys(collection), prize.id]).size;
          return {
            ...prev,
            totalCatches: prev.totalCatches + 1,
            distinctPrizesCaught: distinct,
            consecutiveMisses: 0,
          };
        });
        setCoins((c) => c + 2);
      },
      onDropMiss: () => {
        showNotice('可惜，这次没能夹紧！切换视角再试一次吧');
        setStats((prev) => ({
          ...prev,
          consecutiveMisses: prev.consecutiveMisses + 1,
        }));
      },
      onTargetLockChange: (prize) => {
        setLockedPrize(prize);
      },
      onCameraAngleChange: (angle) => {
        setCameraAngle(angle);
      },
      onClawPositionChange: (coords) => {
        setClawCoords(coords);
      },
    });

    gameRef.current = game;

    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  // Joystick Input Vector
  const handleInputVector = useCallback((x: number, z: number) => {
    if (gameRef.current) {
      gameRef.current.setInput(x, z);
    }
  }, []);

  // Drop Trigger
  const handleDrop = useCallback(() => {
    if (coins <= 0) {
      showNotice('代币不足，点击上方 [+] 免费补充代币！');
      return;
    }

    if (gameRef.current) {
      const dropped = gameRef.current.dropClaw();
      if (dropped) {
        setCoins((c) => Math.max(0, c - 1));
        setStats((prev) => ({
          ...prev,
          totalAttempts: prev.totalAttempts + 1,
          coinsSpent: prev.coinsSpent + 1,
        }));
      }
    }
  }, [coins]);

  // Camera Angle Change
  const handleSetCameraAngle = (angle: CameraAngle) => {
    setCameraAngle(angle);
    if (gameRef.current) {
      gameRef.current.setCameraAngle(angle);
    }
    setStats((prev) => ({
      ...prev,
      viewAnglesSwitched: prev.viewAnglesSwitched + 1,
    }));
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    sound.isMuted = nextMute;
  };

  const handleAddCoins = () => {
    setCoins((c) => c + 5);
    showNotice('成功补充 5 枚代币！');
  };

  const handleClaimAchievementReward = (achievementId: string, rewardCoins: number) => {
    if (!claimedAchievements.includes(achievementId)) {
      setClaimedAchievements((prev) => [...prev, achievementId]);
      setCoins((c) => c + rewardCoins);
      showNotice(`成功领取成就奖励 +${rewardCoins} 代币！`);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* Top Bar Header */}
      <Header
        coins={coins}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onOpenGallery={() => setIsGalleryOpen(true)}
        onOpenAchievements={() => setIsAchievementsOpen(true)}
        onOpenHowToPlay={() => setIsHowToPlayOpen(true)}
        onAddCoin={handleAddCoins}
      />

      {/* 3D WebGL Canvas Viewport */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Floating Status & Instruction Pills */}
      <div className="absolute top-20 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/60 backdrop-blur-md text-xs text-slate-300">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
          <span>
            {gameState === 'IDLE' && (lockedPrize ? `🎯 准心已锁定 [${lockedPrize.name}]，按空格键或红钮下爪！` : '使用摇杆/WASD移动天车，空白处可 360° 拖动旋转视角')}
            {gameState === 'MOVING' && (lockedPrize ? `🎯 已对准 [${lockedPrize.name}]，可随时下爪！` : '天车正在精确定位中...')}
            {gameState === 'DROPPING' && '机械爪正在下垂接触...'}
            {gameState === 'GRABBING' && '三爪正在闭合抓紧...'}
            {gameState === 'ASCENDING' && '机械爪抓取升起中！'}
            {gameState === 'RETURNING' && '天车正在返回出奖仓...'}
            {gameState === 'RELEASING' && '出奖口松爪投递中！'}
            {gameState === 'WIN' && '★ 恭喜抓取成功！★'}
          </span>
        </div>

        {/* Quick Help Link */}
        <button
          onClick={() => {
            sound.playClick();
            setIsHowToPlayOpen(true);
          }}
          className="pointer-events-auto px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/60 backdrop-blur-md text-xs text-slate-300 hover:text-white hover:border-amber-500/50 transition-colors"
        >
          操作指引 💡
        </button>
      </div>

      {/* Temporary Toast / Notice Notification */}
      {noticeMessage && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-amber-500/50 text-amber-200 px-4 py-2 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 animate-bounce">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <span>{noticeMessage}</span>
        </div>
      )}

      {/* Bottom Arcade Controls Bar */}
      <ArcadeControls
        gameState={gameState}
        coins={coins}
        cameraAngle={cameraAngle}
        onSetCameraAngle={handleSetCameraAngle}
        onInputVector={handleInputVector}
        onDrop={handleDrop}
        onInsertCoin={handleAddCoins}
        clawCoords={clawCoords}
        lockedPrize={lockedPrize}
      />

      {/* Modals */}
      {wonPrize && (
        <PrizeModal
          prize={wonPrize}
          onClose={() => {
            setWonPrize(null);
            setGameState('IDLE');
            gameRef.current?.resetToIdle();
          }}
          onOpenGallery={() => {
            setIsGalleryOpen(true);
            setWonPrize(null);
            setGameState('IDLE');
            gameRef.current?.resetToIdle();
          }}
        />
      )}

      {isGalleryOpen && (
        <GalleryModal
          collection={collection}
          onClose={() => setIsGalleryOpen(false)}
        />
      )}

      {isAchievementsOpen && (
        <AchievementsModal
          achievements={INITIAL_ACHIEVEMENTS}
          stats={stats}
          claimedAchievementIds={claimedAchievements}
          onClaimReward={handleClaimAchievementReward}
          onClose={() => setIsAchievementsOpen(false)}
        />
      )}

      {isHowToPlayOpen && (
        <HowToPlayModal onClose={() => setIsHowToPlayOpen(false)} />
      )}
    </div>
  );
}
