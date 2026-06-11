'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  text: string;
  x: number;
  y: number;
  onClose: () => void;
}

export default function TranslationPopup({ text, x, y, onClose }: Props) {
  const [translation, setTranslation] = useState('');
  const [loading, setLoading] = useState(true);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target: 'pt' }),
    })
      .then((r) => r.json())
      .then((data) => setTranslation(data.translatedText || 'Erro'))
      .catch(() => setTranslation('Erro ao traduzir'))
      .finally(() => setLoading(false));
  }, [text]);

  // Ajusta posição para não sair da tela
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 300),
    top: y + 10,
    zIndex: 9999,
  };

  return (
    <div
      ref={popupRef}
      style={style}
      className="bg-gray-900 text-white rounded-lg shadow-xl p-3 max-w-sm text-sm"
    >
      <p className="text-xs text-gray-400 mb-1 italic truncate">{text}</p>
      {loading ? (
        <p className="text-gray-300">Traduzindo...</p>
      ) : (
        <p>{translation}</p>
      )}
    </div>
  );
}
