import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider, SignIn, UserButton, useAuth } from '@clerk/chrome-extension';
import '../index.css';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

function TokenSync() {
  const { getToken, isSignedIn, userId } = useAuth();

  // When signed in, push the session token to chrome.storage for the content script
  if (isSignedIn) {
    getToken().then(token => {
      if (token) {
        chrome.storage.local.set({ clerkToken: token, clerkUserId: userId });
      }
    });

    // Refresh token every 50 seconds (Clerk tokens expire in ~60s)
    setInterval(async () => {
      const token = await getToken();
      if (token) {
        chrome.storage.local.set({ clerkToken: token });
      }
    }, 50_000);
  }

  return null;
}

function AuthContent() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <div style={{ color: '#94a3b8', fontSize: 14 }}>Loading...</div>
    );
  }

  if (!isSignedIn) {
    return (
      <>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1e293b', margin: 0 }}>Web Annotator</h1>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 8 }}>Sign in to sync your annotations</p>
        </div>
        <SignIn />
      </>
    );
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: 16,
      padding: 32,
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      textAlign: 'center',
      maxWidth: 400,
    }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: '#1e293b', margin: '0 0 8px' }}>You're signed in</h2>
      <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 20px' }}>
        Your annotations will sync across devices. You can close this tab.
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
        <UserButton />
      </div>
      <button
        onClick={() => window.close()}
        style={{
          marginTop: 20,
          padding: '8px 24px',
          borderRadius: 8,
          border: 'none',
          background: '#3b82f6',
          color: 'white',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Close
      </button>
    </div>
  );
}

function AuthPage() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <TokenSync />
        <AuthContent />
      </div>
    </ClerkProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthPage />
  </StrictMode>
);
