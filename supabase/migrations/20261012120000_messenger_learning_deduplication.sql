begin;
create extension if not exists pg_trgm with schema extensions;
create or replace function public.messenger_question_key(question text)
returns text language sql immutable set search_path = public as $$
 select trim(regexp_replace(lower(coalesce(question,'')), '[^[:alnum:]]+', ' ', 'g'));
$$;
create or replace function public.messenger_questions_match(a text, b text)
returns boolean language sql immutable set search_path = public, extensions as $$
 select public.messenger_question_key(a) = public.messenger_question_key(b) or (
   length(public.messenger_question_key(a)) >= 12 and length(public.messenger_question_key(b)) >= 12
   and similarity(public.messenger_question_key(a), public.messenger_question_key(b)) >= 0.82
   and (select coalesce(array_agg(token order by token),'{}') from regexp_split_to_table(public.messenger_question_key(a),' ') token where token ~ '[0-9]' or token in ('not','no','without','hindi','wala'))
     = (select coalesce(array_agg(token order by token),'{}') from regexp_split_to_table(public.messenger_question_key(b),' ') token where token ~ '[0-9]' or token in ('not','no','without','hindi','wala'))
 );
$$;
create or replace function public.record_messenger_knowledge_candidate(p_source_type text,p_question text,p_suggested_answer text default '',p_source_event_ids text[] default '{}')
returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare existing public.messenger_knowledge_candidates; result_id uuid; normalized text;
begin
 if p_source_type not in ('unanswered','live_chat') then raise exception 'Unsupported Messenger knowledge source type.'; end if;
 normalized := left(public.messenger_question_key(p_question),500);
 if length(normalized)<3 then raise exception 'A meaningful customer question is required.'; end if;
 -- One lock covers fuzzy matches too, preventing concurrent inserts of variants.
 perform pg_advisory_xact_lock(hashtextextended('messenger-learning-candidates',0));
 select * into existing from public.messenger_knowledge_candidates c
 where public.messenger_questions_match(c.sample_question,p_question)
 order by (c.status='approved') desc,(c.normalized_question=normalized) desc,c.created_at limit 1 for update;
 if found then
  update public.messenger_knowledge_candidates set
   occurrence_count=occurrence_count+1,
   source_event_ids=array(select distinct unnest(existing.source_event_ids || coalesce(p_source_event_ids,'{}'))),
   suggested_answer=case when existing.status='pending' and p_source_type='live_chat' and length(trim(coalesce(p_suggested_answer,'')))>0 then left(trim(p_suggested_answer),4000) else existing.suggested_answer end,
   source_type=case when existing.status='pending' and p_source_type='live_chat' then 'live_chat' else existing.source_type end,
   updated_at=now()
  where id=existing.id returning id into result_id;
 else
  insert into public.messenger_knowledge_candidates(source_type,normalized_question,sample_question,suggested_answer,source_event_ids)
  values(p_source_type,normalized,left(trim(p_question),1000),left(trim(coalesce(p_suggested_answer,'')),4000),coalesce(p_source_event_ids,'{}')) returning id into result_id;
 end if;
 return result_id;
end;
$$;
-- Consolidate existing duplicates, preferring reviewed approved answers.
do $$
declare keeper public.messenger_knowledge_candidates; duplicate public.messenger_knowledge_candidates;
begin
 perform pg_advisory_xact_lock(hashtextextended('messenger-learning-candidates',0));
 for keeper in select * from public.messenger_knowledge_candidates order by (status='approved') desc,created_at,id loop
  if not exists(select 1 from public.messenger_knowledge_candidates where id=keeper.id) then continue; end if;
  for duplicate in select * from public.messenger_knowledge_candidates c where c.id<>keeper.id and public.messenger_questions_match(c.sample_question,keeper.sample_question) loop
   update public.messenger_knowledge_candidates set occurrence_count=occurrence_count+duplicate.occurrence_count,
    source_event_ids=array(select distinct unnest(source_event_ids || duplicate.source_event_ids)),
    suggested_answer=case when status='pending' and duplicate.source_type='live_chat' then duplicate.suggested_answer else suggested_answer end
   where id=keeper.id;
   delete from public.messenger_knowledge_candidates where id=duplicate.id;
  end loop;
 end loop;
end $$;
revoke all on function public.record_messenger_knowledge_candidate(text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.record_messenger_knowledge_candidate(text,text,text,text[]) to service_role;
commit;
