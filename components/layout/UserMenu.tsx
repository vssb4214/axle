'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export function UserMenu() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClientComponentClient() as SupabaseClient;

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!isMounted) return;
      const user = data.user;
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const { data: profileRow } = await supabase
        .from('users')
        .select('id, display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      if (!isMounted) return;
      if (profileRow) {
        setProfile(profileRow as Profile);
      }
      setLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  if (loading) {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-slate-800" />;
  }

  if (!profile) {
    return (
      <button
        className="btn-secondary text-xs"
        onClick={() => {
          router.push('/auth');
        }}
      >
        Sign in
      </button>
    );
  }

  return (
    <button
      onClick={() => router.push('/dashboard')}
      className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs hover:bg-slate-800"
    >
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar_url}
          alt={profile.display_name ?? 'User'}
          className="h-7 w-7 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/80 text-[10px] font-semibold uppercase">
          {(profile.display_name ?? 'U').slice(0, 2)}
        </div>
      )}
      <span className="max-w-[7rem] truncate">{profile.display_name ?? 'Profile'}</span>
    </button>
  );
}

