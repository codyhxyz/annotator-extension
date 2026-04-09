import { useState, useEffect } from 'react';
import { LogIn, User, LogOut } from 'lucide-react';
import { watchAuthState, openAuthPage, signOut } from '../sync';

export default function AuthButton() {
  const [signedIn, setSignedIn] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const cleanup = watchAuthState(setSignedIn);
    return cleanup;
  }, []);

  if (!signedIn) {
    return (
      <button
        onClick={() => openAuthPage()}
        className="p-3 rounded-full text-slate-600 hover:bg-slate-100/50 hover:text-slate-900 transition-all duration-200 hover:scale-105"
        title="Sign in to sync"
      >
        <LogIn size={20} className="stroke-2" />
      </button>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-3 rounded-full text-green-600 hover:bg-green-50 transition-all duration-200 hover:scale-105"
        title="Signed in"
      >
        <User size={20} className="stroke-2" />
      </button>
      {showMenu && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 8,
            background: 'white',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            zIndex: 100,
            minWidth: 140,
          }}
        >
          <button
            onClick={() => { openAuthPage(); setShowMenu(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              width: '100%',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              color: '#475569',
              background: 'transparent',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <User size={14} /> Account
          </button>
          <button
            onClick={async () => { await signOut(); setShowMenu(false); setSignedIn(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              width: '100%',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              color: '#ef4444',
              background: 'transparent',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#fef2f2'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
