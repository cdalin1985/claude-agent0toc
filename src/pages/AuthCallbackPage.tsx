import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase handles the token from URL automatically
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/', { replace: true });
      else navigate('/login', { replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="font-[Bebas_Neue] text-4xl text-[#E8E2D6] mb-2">Signing you in…</div>
        <div className="skeleton h-1 w-32 mx-auto mt-4" />
      </div>
    </div>
  );
}
