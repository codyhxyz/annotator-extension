import { useState, useEffect } from 'react';
import { subscribe, type PresenceUser, type RealtimeMessage } from '../sync/realtime';

export default function PresenceIndicator() {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const unsubscribe = subscribe((msg: RealtimeMessage) => {
      switch (msg.type) {
        case 'presence:state':
        case 'presence:join':
        case 'presence:leave':
          setUsers(msg.users);
          break;
      }
    });
    return unsubscribe;
  }, []);

  if (users.length === 0) return null;

  const maxShow = 5;
  const visible = users.slice(0, maxShow);
  const overflow = users.length - maxShow;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      pointerEvents: 'auto',
    }}>
      {visible.map((user, i) => (
        <div
          key={user.userId}
          title={user.displayName}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '2px solid white',
            background: '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            marginLeft: i > 0 ? -8 : 0,
            zIndex: maxShow - i,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
              {user.displayName[0]?.toUpperCase() || '?'}
            </span>
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '2px solid white',
          background: '#3b82f6',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 600,
          marginLeft: -8,
          zIndex: 0,
        }}>
          +{overflow}
        </div>
      )}
    </div>
  );
}
