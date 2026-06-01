import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import type { Course } from '../types';

export function useSchedules() {
  const [activeSlot, setActiveSlot] = useState(1);
  const [schedules, setSchedules] = useState<Record<number, Course[]>>({ 1: [], 2: [], 3: [] });
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });
  }, []);

  // Load all 3 schedules from Supabase
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('schedules')
      .select('slot, courses')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (!data) return;
        const loaded: Record<number, Course[]> = { 1: [], 2: [], 3: [] };
        data.forEach(row => { loaded[row.slot] = row.courses; });
        setSchedules(loaded);
      });
  }, [userId]);

  // Save a slot to Supabase
  const saveSlot = useCallback(async (slot: number, courses: Course[]) => {
    if (!userId) return;
    await supabase.from('schedules').upsert(
      { user_id: userId, slot, courses, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,slot' }
    );
  }, [userId]);

  const scheduled = schedules[activeSlot] ?? [];

  const toggleSchedule = (course: Course) => {
    const current = schedules[activeSlot];
    const exists = current.some(c => c.id === course.id);
    const updated = exists ? current.filter(c => c.id !== course.id) : [...current, course];
    const newSchedules = { ...schedules, [activeSlot]: updated };
    setSchedules(newSchedules);
    saveSlot(activeSlot, updated);
  };

  return { scheduled, activeSlot, setActiveSlot, schedules, toggleSchedule };
}