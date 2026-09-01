import React, { useState, useEffect, useRef } from 'react';

// Default initial feeds is empty so reset completely clears all data
const INITIAL_FEEDS = [];

export default function Dashboard({
  currentUser,
  displayUser,
  parsedUser = {},
  teamMembers = [],
  headerSelectedProject = '전체',
  onSelectProject,
  schedules = [],
  setSchedules,
  feeds: feedsProp,
  setFeeds: setFeedsProp,
  onAddSchedule,
  onOpenScheduleDetail,
  onNavigateToSync,
  onSwitchUser,
  onLogout,
  onResetData
}) {
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'issue' | 'vacation' | 'meeting'
  const [composerText, setComposerText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const [internalFeeds, setInternalFeeds] = useState(() => {
    try {
      localStorage.removeItem('zal_feeds'); // purge old cache
      const saved = localStorage.getItem('zal_feeds_v2');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Use external feeds/setFeeds if provided (lifted state from App.jsx), else use internal
  const feeds = feedsProp !== undefined ? feedsProp : internalFeeds;
  const setFeeds = setFeedsProp !== undefined ? setFeedsProp : setInternalFeeds;


  const [expandedCommentFeedIds, setExpandedCommentFeedIds] = useState({});
  const [commentInputs, setCommentInputs] = useState({});
  const [reportModalType, setReportModalType] = useState(null); // 'daily' | 'weekly' | null
  const [timelineDate, setTimelineDate] = useState(() => new Date());
  const [selectedMemberId, setSelectedMemberId] = useState('all');

  const timelineDayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const formattedTimelineDate = `${timelineDate.getMonth() + 1}월 ${timelineDate.getDate()}일 (${timelineDayNames[timelineDate.getDay()]})`;

  const today = new Date();
  const formattedTodayHeader = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일 ${timelineDayNames[today.getDay()]}요일`;
  const getTodayFormatted = () => {
    const d = new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  const displayMembers = (teamMembers && teamMembers.length > 0) ? teamMembers : [
    { id: 'sh', name: '정윤희', role: '부장', avatarPic: '/pic1_thumb.png', color: '#6366f1' },
    { id: 'sangmoo', name: '조상무', role: '상무', avatarPic: '/pic2_thumb.png', color: '#10b981' },
    { id: 'daum', name: '정다음', role: '사원', avatarPic: '/pic3_thumb.png', color: '#f59e0b' }
  ];

  const handlePrevTimelineDate = () => {
    setTimelineDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1));
  };

  const handleNextTimelineDate = () => {
    setTimelineDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1));
  };
  const [copiedReport, setCopiedReport] = useState(false);
  const [highlightedCardId, setHighlightedCardId] = useState(null);
  const [editingFeedId, setEditingFeedId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [toastMessage, setToastMessage] = useState(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [expandedRawCardIds, setExpandedRawCardIds] = useState({});
  const userMenuRef = useRef(null);
  const projectMenuRef = useRef(null);
  const composerTextareaRef = useRef(null);

  const toggleRawText = (cardId, e) => {
    e?.stopPropagation();
    setExpandedRawCardIds(prev => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const formatHour = (hour) => {
    if (hour === undefined || hour === null) return '09:00';
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const findMatchingSchedule = (item) => {
    if (!schedules || schedules.length === 0) return null;
    let match = schedules.find(s => s.id === item.id || s.id === item.feedId || s.feedId === item.feedId || s.feedId === item.id);
    if (match) return match;

    const itemTitle = (item.title || '').replace(/^[🚨🏖️📋🤝📢\s\[\]]+/g, '').trim();
    match = schedules.find(s => {
      if (!s.title) return false;
      const sTitle = s.title.replace(/^[🚨🏖️📋🤝📢\s\[\]]+/g, '').trim();
      if (itemTitle && (sTitle.includes(itemTitle) || itemTitle.includes(sTitle))) {
        return true;
      }
      return false;
    });
    return match;
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleShareCard = (item) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('cardId', item.id);
      url.searchParams.set('feedId', item.feedId);
      const d = new Date();
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      url.searchParams.set('date', dateStr);
      if (item.category) {
        url.searchParams.set('category', item.category);
      }
      
      const shareUrl = url.toString();
      const authorRoleText = item.authorRole ? ` ${item.authorRole}` : '';
      const badgeClean = item.badgeText ? ` [${item.badgeText}]` : '';
      const shareMessage = `[잘먹이] ${item.authorName}${authorRoleText}님의${badgeClean} 항목 공유\n📌 ${item.title}\n👉 바로가기: ${shareUrl}`;

      navigator.clipboard.writeText(shareMessage).then(() => {
        showToast('🔗 카카오톡/메신저 공유 메시지 및 링크가 복사되었습니다!');
      }).catch(() => {
        navigator.clipboard.writeText(shareUrl);
        showToast('🔗 공유 링크가 복사되었습니다!');
      });
    } catch (err) {
      console.error('Failed to copy share link:', err);
      showToast('🔗 공유 링크 생성 완료');
    }
  };

  // Deep Link detection on page load (URL query param cardId / feedId)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cardId = params.get('cardId');
    const feedId = params.get('feedId');
    const targetId = cardId || feedId;

    if (targetId) {
      setHighlightedCardId(cardId || feedId);
      // Wait for DOM to finish rendering cards
      setTimeout(() => {
        const el = document.getElementById(`card_${cardId}`) || document.getElementById(`card_${feedId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 400);

      // Keep highlight for 4 seconds then gracefully clear
      setTimeout(() => {
        setHighlightedCardId(null);
      }, 4000);
    }
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target)) {
        setIsProjectMenuOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // Sync feeds to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('zal_feeds_v2', JSON.stringify(feeds));
    } catch (e) {}
  }, [feeds]);

  // Current logged in user is executive approver (조상무)
  const isApprover = currentUser?.id === 'sangmoo' || currentUser?.name === '조상무' || currentUser?.role === '상무';

  // Handle Quick Composer Post (delegates to the exact same AI schedule processor as Calendar)
  const handleComposerSubmit = async (e) => {
    e?.preventDefault();
    const text = composerText.trim();
    if (!text || isSubmitting) return;

    setIsSubmitting(true);
    setComposerText('');
    setIsInputFocused(false);
    composerTextareaRef.current?.blur();

    try {
      if (onAddSchedule) {
        await onAddSchedule(text, currentUser);
      }
    } finally {
      setIsSubmitting(false);
      setIsInputFocused(false);
      composerTextareaRef.current?.blur();
    }
  };

  // Toggle Like reaction
  const handleToggleLike = (feedId) => {
    setFeeds(prev => prev.map(f => {
      if (f.id === feedId) {
        const nextLiked = !f.hasLiked;
        return {
          ...f,
          hasLiked: nextLiked,
          likes: nextLiked ? f.likes + 1 : Math.max(0, f.likes - 1)
        };
      }
      return f;
    }));
  };

  // Toggle Cheer reaction
  const handleToggleCheer = (feedId) => {
    setFeeds(prev => prev.map(f => {
      if (f.id === feedId) {
        const nextCheered = !f.hasCheered;
        return {
          ...f,
          hasCheered: nextCheered,
          cheers: nextCheered ? f.cheers + 1 : Math.max(0, f.cheers - 1)
        };
      }
      return f;
    }));
  };

  // Vacation & Colleague Request Approval Action
  const handleApproveVacation = (feedId, approve = true) => {
    const approverDisplay = `${currentUser?.name || '담당자'} ${currentUser?.role || ''}`.trim();
    let targetFeed = null;
    setFeeds(prev => {
      const next = prev.map(f => {
        if (f.id === feedId && f.vacationInfo) {
          targetFeed = f;
          return {
            ...f,
            vacationInfo: {
              ...f.vacationInfo,
              status: approve ? 'approved' : 'rejected',
              approverName: approverDisplay,
              approvedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            }
          };
        }
        return f;
      });
      try { localStorage.setItem('zal_feeds_v2', JSON.stringify(next)); } catch (_) {}
      return next;
    });

    // Also sync status with Calendar schedules so Dashboard and Calendar share unified state
    if (setSchedules) {
      setSchedules(prev => {
        const next = prev.map(s => {
          const isMatch = targetFeed && (
            (targetFeed.content && targetFeed.content.includes(s.title)) ||
            (targetFeed.vacationInfo?.type && s.title && s.title.includes(targetFeed.vacationInfo.type)) ||
            (/반차|휴가|연차/i.test(s.title || '') && /반차|휴가|연차/i.test(targetFeed.vacationInfo?.type || '')) ||
            (s.status === 'requested' && (s.memberId === targetFeed.authorId || s.requesterId === targetFeed.authorId))
          );
          if (isMatch) {
            return {
              ...s,
              status: approve ? 'accepted' : 'rejected',
              statusUpdatedAt: Date.now(),
              updatedAt: new Date().toISOString()
            };
          }
          return s;
        });
        try { localStorage.setItem('zal_schedules', JSON.stringify(next)); } catch (_) {}
        return next;
      });
    }
  };

  // Start Editing Feed
  const handleStartEdit = (feed) => {
    setEditingFeedId(feed.id);
    setEditingText(feed.content || '');
  };

  // Cancel Editing Feed
  const handleCancelEdit = () => {
    setEditingFeedId(null);
    setEditingText('');
  };

  // Save Edited Feed
  const handleSaveEdit = (feedId) => {
    const text = editingText.trim();
    if (!text) return;

    // AI schedule parsing & badge extraction
    const hasIssue = /긴급|이슈|장애|오류|버그|지연|에러|디버깅/i.test(text);
    const hasVacation = /반차|연차|휴가|병가|조퇴/i.test(text);
    const hasRequest = /요청|부탁|신청|컨펌|검토|확인\s*바랍니다|수락|면담/i.test(text);
    const hasMeeting = /회의|미팅|리뷰|브리핑|스탠드업/i.test(text);

    let targetUserId = 'sangmoo';
    let targetUserName = '조상무';
    let targetUserRole = '상무';

    if (hasVacation || /조상무|상무님|상무/i.test(text)) {
      targetUserId = 'sangmoo';
      targetUserName = '조상무';
      targetUserRole = '상무';
    } else if (/정윤희|정부장|부장님|윤희/i.test(text)) {
      targetUserId = 'sh';
      targetUserName = '정윤희';
      targetUserRole = '부장';
    } else if (/정다음|다음사원|다음/i.test(text)) {
      targetUserId = 'daum';
      targetUserName = '정다음';
      targetUserRole = '사원';
    } else {
      if (currentUser?.id === 'daum' || currentUser?.id === 'daeum') {
        targetUserId = hasVacation ? 'sangmoo' : 'sh';
        targetUserName = hasVacation ? '조상무' : '정윤희';
        targetUserRole = hasVacation ? '상무' : '부장';
      } else {
        targetUserId = 'sangmoo';
        targetUserName = '조상무';
        targetUserRole = '상무';
      }
    }

    let primaryType = 'all';
    if (hasVacation || hasRequest) primaryType = 'vacation';
    else if (hasIssue) primaryType = 'issue';
    else if (hasMeeting) primaryType = 'meeting';

    const badges = [];
    if (hasIssue) {
      const match = text.match(/(?:긴급|이슈|장애|오류|에러|디버깅)[^\n,.]*/i);
      badges.push({
        id: `b_${Date.now()}_1`,
        type: 'issue',
        label: `🚨 ${match ? match[0].trim() : '긴급 이슈 대응'}`,
        category: '이슈'
      });
    }

    if (hasVacation) {
      const isMorning = /오전\s*반차/i.test(text);
      const isAfternoon = /오후\s*반차/i.test(text);
      const vacType = isMorning ? '오전 반차' : isAfternoon ? '오후 반차' : '연차 휴가';
      badges.push({
        id: `b_${Date.now()}_3`,
        type: 'vacation',
        label: `🏖️ ${vacType} 신청`,
        category: '요청'
      });
    } else if (hasRequest) {
      const reqType = hasMeeting ? '미팅 요청' : (/검토|컨펌/i.test(text) ? '검토 요청' : '업무 요청');
      badges.push({
        id: `b_${Date.now()}_req`,
        type: 'vacation',
        label: `📋 ${reqType} (${targetUserName} ${targetUserRole})`,
        category: '요청'
      });
    } else if (hasMeeting) {
      const match = text.match(/(?:회의|미팅|리뷰|브리핑)[^\n,.]*/i);
      badges.push({
        id: `b_${Date.now()}_2`,
        type: 'meeting',
        label: `🤝 ${match ? match[0].trim() : '팀 회의 일정'}`,
        category: '회의'
      });
    }

    if (badges.length === 0) {
      badges.push({
        id: `b_${Date.now()}_4`,
        type: 'work',
        label: '📄 오늘 업무 공유',
        category: '일반'
      });
    }

    setFeeds(prev => prev.map(f => {
      if (f.id === feedId) {
        let updatedVacInfo = f.vacationInfo;
        if (hasVacation || hasRequest) {
          const reqType = hasVacation 
            ? (/오전/i.test(text) ? '오전 반차' : /오후/i.test(text) ? '오후 반차' : '휴가') 
            : (hasMeeting ? '미팅 요청' : (/검토|컨펌/i.test(text) ? '검토 요청' : '업무 요청'));
          updatedVacInfo = {
            type: reqType,
            date: getTodayFormatted(),
            status: f.vacationInfo?.status || 'pending',
            approverName: targetUserName,
            approverRole: targetUserRole,
            targetUserId: targetUserId,
            requesterId: f.authorId,
            requesterName: f.authorName,
            approvedAt: f.vacationInfo?.approvedAt || null
          };
        } else {
          updatedVacInfo = null;
        }

        return {
          ...f,
          content: text,
          type: primaryType,
          aiBadges: badges,
          vacationInfo: updatedVacInfo
        };
      }
      return f;
    }));

    setEditingFeedId(null);
    setEditingText('');
    showToast('✏️ 항목이 성공적으로 수정되었습니다.');
  };

  // Delete Feed
  const handleDeleteFeed = (feedId) => {
    setFeeds(prev => {
      const next = prev.filter(f => f.id !== feedId);
      try {
        localStorage.setItem('zal_feeds_v2', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    showToast('🗑️ 항목이 삭제되었습니다.');
  };

  // Add Comment to Feed
  const handleAddComment = (feedId) => {
    const text = (commentInputs[feedId] || '').trim();
    if (!text) return;

    const newComment = {
      id: `c_${Date.now()}`,
      authorId: currentUser?.id || 'sh',
      authorName: currentUser?.name || '정윤희',
      authorRole: currentUser?.role || '부장',
      authorAvatarPic: currentUser?.avatarPic || '/pic1_thumb.png',
      text: text,
      createdAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    };

    setFeeds(prev => prev.map(f => {
      if (f.id === feedId) {
        return {
          ...f,
          comments: [...f.comments, newComment]
        };
      }
      return f;
    }));

    setCommentInputs(prev => ({ ...prev, [feedId]: '' }));
    setExpandedCommentFeedIds(prev => ({ ...prev, [feedId]: true }));
  };

  // Extract only the sentence(s) directly relevant to a specific category, avoiding cross-contamination
  const getRelevantSnippet = (content, category) => {
    if (!content) return '';
    const sentences = content.split(/(?<=[.!?\n])\s+/).map(s => s.trim()).filter(Boolean);

    if (category === '이슈') {
      const matched = sentences.filter(s => 
        (s.includes('에러') || s.includes('버그') || s.includes('디버깅') || s.includes('장애') || s.includes('긴급') || s.includes('해결') || s.includes('수정') || s.includes('조치')) &&
        !s.includes('미팅') && !s.includes('반차') && !s.includes('휴가')
      );
      return matched.join(' ');
    }
    if (category === '미팅') {
      const matched = sentences.filter(s => 
        (s.includes('회의') || s.includes('미팅') || s.includes('리뷰') || s.includes('참석') || s.includes('브리핑') || s.includes('논의')) &&
        !s.includes('반차') && !s.includes('휴가')
      );
      return matched.join(' ');
    }
    if (category === '요청' || category === '휴가') {
      const matched = sentences.filter(s => 
        (s.includes('반차') || s.includes('휴가') || s.includes('신청') || s.includes('요청') || s.includes('승인') || s.includes('부탁')) &&
        !s.includes('디버깅')
      );
      return matched.join(' ');
    }
    if (category === '공지') {
      const matched = sentences.filter(s => 
        s.includes('공지') || s.includes('안내') || s.includes('알림') || s.includes('회식') || s.includes('전사')
      );
      return matched.join(' ');
    }
    return '';
  };

  // Granular categorized items when specific category tab or 'all' is selected
  const getCategoryItems = (categoryKey) => {
    const items = [];

    feeds.forEach(feed => {
      // 1. Issues
      if (categoryKey === 'all' || categoryKey === 'issue') {
        const issueBadges = (feed.aiBadges || []).filter(b => b.category === '이슈' || b.type === 'issue');
        if (issueBadges.length > 0) {
          issueBadges.forEach((b, bIdx) => {
            const snippet = getRelevantSnippet(feed.content, '이슈');
            items.push({
              id: `${feed.id}_issue_${bIdx}`,
              feedId: feed.id,
              authorId: feed.authorId,
              authorName: feed.authorName,
              authorRole: feed.authorRole,
              authorAvatarPic: feed.authorAvatarPic,
              authorColor: feed.authorColor,
              timeDisplay: feed.timeDisplay,
              createdAt: feed.createdAt,
              category: '이슈',
              title: b.label,
              description: snippet && snippet !== b.label ? snippet : '',
              badgeText: '🚨 이슈 대응',
              badgeColor: '#dc2626',
              badgeBg: '#fef2f2',
              badgeBorder: '#fecaca',
              feed: feed
            });
          });
        } else if (feed.type === 'issue' && (feed.content.includes('에러') || feed.content.includes('장애') || feed.content.includes('버그') || feed.content.includes('디버깅'))) {
          const snippet = getRelevantSnippet(feed.content, '이슈') || feed.content;
          items.push({
            id: `${feed.id}_issue_main`,
            feedId: feed.id,
            authorId: feed.authorId,
            authorName: feed.authorName,
            authorRole: feed.authorRole,
            authorAvatarPic: feed.authorAvatarPic,
            authorColor: feed.authorColor,
            timeDisplay: feed.timeDisplay,
            createdAt: feed.createdAt,
            category: '이슈',
            title: snippet,
            description: '',
            badgeText: '🚨 이슈 대응',
            badgeColor: '#dc2626',
            badgeBg: '#fef2f2',
            badgeBorder: '#fecaca',
            feed: feed
          });
        }
      }

      // 2. Requests & Vacations
      if (categoryKey === 'all' || categoryKey === 'vacation') {
        let vInfo = feed.vacationInfo;
        // Auto-detect meeting/work/leave requests in feed content or aiBadges if missing
        const isLeaveText = /반차|휴가|연차|병가|결재/i.test(feed.content || '') || feed.type === 'vacation' || (feed.aiBadges && feed.aiBadges.some(b => b.category === '휴가' || /반차|휴가|연차/i.test(b.label || '')));
        const isRequestText = feed.content.includes('요청') || feed.content.includes('신청') || feed.content.includes('부탁') || feed.content.includes('결재') || isLeaveText;

        if (!vInfo && isRequestText) {
          let targetUserId = isLeaveText ? 'sangmoo' : 'sh';
          let targetUserName = isLeaveText ? '조상무' : '정윤희';
          let targetUserRole = isLeaveText ? '상무' : '부장';
          if (/반차|휴가|연차/i.test(feed.content) || /조상무|상무/i.test(feed.content)) {
            targetUserId = 'sangmoo';
            targetUserName = '조상무';
            targetUserRole = '상무';
          } else if (/정다음|다음/i.test(feed.content)) {
            targetUserId = 'daum';
            targetUserName = '정다음';
            targetUserRole = '사원';
          } else if (/정윤희|정부장|부장/i.test(feed.content)) {
            targetUserId = 'sh';
            targetUserName = '정윤희';
            targetUserRole = '부장';
          }
          const reqType = /미팅|회의|면담/i.test(feed.content) ? '미팅 요청' : (isLeaveText ? (feed.content.includes('오후') ? '오후 반차' : feed.content.includes('오전') ? '오전 반차' : '휴가') : '업무 요청');
          vInfo = {
            type: reqType,
            date: getTodayFormatted(),
            status: 'pending',
            approverName: targetUserName,
            approverRole: targetUserRole,
            targetUserId: targetUserId,
            requesterId: feed.authorId,
            requesterName: feed.authorName,
            approvedAt: null
          };
        }

        if (vInfo) {
          const isVac = vInfo.type?.includes('반차') || vInfo.type?.includes('휴가') || /반차|휴가|연차/i.test(feed.content || '');
          let approverName = vInfo.approverName;
          let approverRole = vInfo.approverRole || '';
          if (/조상무|상무님|조상무님/i.test(feed.content || '')) {
            approverName = '조상무';
            approverRole = '상무';
          } else if (/정윤희|정부장|부장님|윤희/i.test(feed.content || '')) {
            approverName = '정윤희';
            approverRole = '부장';
          } else if (/정다음|정사원|다음/i.test(feed.content || '')) {
            approverName = '정다음';
            approverRole = '사원';
          }
          const targetStr = `${approverName || '담당자'} ${approverRole || ''}`.trim();
          
          let title = isVac 
            ? `🏖️ ${vInfo.type || '휴가'} 신청 (${vInfo.date})` 
            : `📋 ${vInfo.type} (${targetStr} 수락 요청)`;
          
          let badgeText = vInfo.status === 'approved' 
            ? '✅ 승인완료' 
            : (isVac ? '🏖️ 결재요청' : '📋 결재요청');

          items.push({
            id: `${feed.id}_vacation`,
            feedId: feed.id,
            authorId: feed.authorId,
            authorName: feed.authorName,
            authorRole: feed.authorRole,
            authorAvatarPic: feed.authorAvatarPic,
            authorColor: feed.authorColor,
            timeDisplay: feed.timeDisplay,
            createdAt: feed.createdAt,
            category: '요청',
            title: title,
            description: feed.content,
            badgeText: badgeText,
            badgeColor: vInfo.status === 'approved' ? '#059669' : '#b45309',
            badgeBg: vInfo.status === 'approved' ? '#ecfdf5' : '#fffbeb',
            badgeBorder: vInfo.status === 'approved' ? '#a7f3d0' : '#fde68a',
            vacationInfo: vInfo,
            feed: feed
          });
        }
      }

      // 3. Meetings / Conferences (Exclude pending meeting requests which belong to '요청')
      if (categoryKey === 'all' || categoryKey === 'meeting') {
        const isRequestFeed = feed.content.includes('요청') || feed.content.includes('신청') || feed.content.includes('부탁');
        if (!isRequestFeed) {
          const meetingBadges = (feed.aiBadges || []).filter(b => 
            (b.category === '미팅' || b.category === '회의' || b.type === 'meeting' ||
            b.label?.includes('회의') || b.label?.includes('미팅') || b.label?.includes('리뷰')) &&
            !b.label?.includes('요청')
          );
          if (meetingBadges.length > 0) {
            meetingBadges.forEach((b, bIdx) => {
              const snippet = getRelevantSnippet(feed.content, '미팅');
              items.push({
                id: `${feed.id}_meeting_${bIdx}`,
                feedId: feed.id,
                authorId: feed.authorId,
                authorName: feed.authorName,
                authorRole: feed.authorRole,
                authorAvatarPic: feed.authorAvatarPic,
                authorColor: feed.authorColor,
                timeDisplay: feed.timeDisplay,
                createdAt: feed.createdAt,
                category: '회의',
                title: b.label.replace(/^💼/, '🤝').replace(/^🏢/, '🤝'),
                description: snippet && snippet !== b.label ? snippet : '',
                badgeText: '🤝 회의',
                badgeColor: '#4338ca',
                badgeBg: '#eef2ff',
                badgeBorder: '#c7d2fe',
                feed: feed
              });
            });
          } else if (feed.type === 'meeting' && (feed.content.includes('회의') || feed.content.includes('미팅') || feed.content.includes('리뷰'))) {
            const snippet = getRelevantSnippet(feed.content, '미팅') || feed.content;
            items.push({
              id: `${feed.id}_meeting_main`,
              feedId: feed.id,
              authorId: feed.authorId,
              authorName: feed.authorName,
              authorRole: feed.authorRole,
              authorAvatarPic: feed.authorAvatarPic,
              authorColor: feed.authorColor,
              timeDisplay: feed.timeDisplay,
              createdAt: feed.createdAt,
              category: '회의',
              title: snippet,
              description: '',
              badgeText: '🤝 회의',
              badgeColor: '#4338ca',
              badgeBg: '#eef2ff',
              badgeBorder: '#c7d2fe',
              feed: feed
            });
          }
        }
      }

      // 4. Notices
      if (categoryKey === 'all' || categoryKey === 'notice') {
        const noticeBadges = (feed.aiBadges || []).filter(b => b.category === '공지' || b.category === '전사공지' || b.type === 'notice' || b.label?.includes('공지'));
        if (noticeBadges.length > 0) {
          noticeBadges.forEach((b, bIdx) => {
            const snippet = getRelevantSnippet(feed.content, '공지');
            items.push({
              id: `${feed.id}_notice_${bIdx}`,
              feedId: feed.id,
              authorId: feed.authorId,
              authorName: feed.authorName,
              authorRole: feed.authorRole,
              authorAvatarPic: feed.authorAvatarPic,
              authorColor: feed.authorColor,
              timeDisplay: feed.timeDisplay,
              createdAt: feed.createdAt,
              category: '공지',
              title: b.label,
              description: snippet && snippet !== b.label ? snippet : '',
              badgeText: '📢 공지',
              badgeColor: '#475569',
              badgeBg: '#f8fafc',
              badgeBorder: '#e2e8f0',
              feed: feed
            });
          });
        } else if (feed.type === 'notice' || feed.content.includes('공지') || feed.content.includes('회식') || feed.content.includes('안내')) {
          const snippet = getRelevantSnippet(feed.content, '공지') || feed.content;
          items.push({
            id: `${feed.id}_notice_main`,
            feedId: feed.id,
            authorId: feed.authorId,
            authorName: feed.authorName,
            authorRole: feed.authorRole,
            authorAvatarPic: feed.authorAvatarPic,
            authorColor: feed.authorColor,
            timeDisplay: feed.timeDisplay,
            createdAt: feed.createdAt,
            category: '공지',
            title: snippet,
            description: '',
            badgeText: '📢 공지',
            badgeColor: '#475569',
            badgeBg: '#f8fafc',
            badgeBorder: '#e2e8f0',
            feed: feed
          });
        }
      }

      // 5. General / Work (Everything that is not issue, request, meeting, or notice)
      if (categoryKey === 'all' || categoryKey === 'work' || categoryKey === 'general') {
        const otherBadges = (feed.aiBadges || []).filter(b => 
          b.category !== '이슈' && b.category !== '휴가' && b.category !== '요청' && b.category !== '미팅' && b.category !== '회의' && b.category !== '공지' && b.category !== '전사공지' &&
          !b.label?.includes('회의') && !b.label?.includes('미팅') && !b.label?.includes('리뷰') &&
          !b.label?.includes('반차') && !b.label?.includes('휴가') &&
          !b.label?.includes('에러') && !b.label?.includes('버그') && !b.label?.includes('디버깅') && !b.label?.includes('장애') &&
          !b.label?.includes('공지')
        );
        if (otherBadges.length > 0) {
          otherBadges.forEach((b, bIdx) => {
            items.push({
              id: `${feed.id}_work_${bIdx}`,
              feedId: feed.id,
              authorId: feed.authorId,
              authorName: feed.authorName,
              authorRole: feed.authorRole,
              authorAvatarPic: feed.authorAvatarPic,
              authorColor: feed.authorColor,
              timeDisplay: feed.timeDisplay,
              createdAt: feed.createdAt,
              category: '일반',
              title: b.label.replace(/^💼/, '📄'),
              description: '',
              badgeText: '📄 일반',
              badgeColor: '#64748b',
              badgeBg: '#f8fafc',
              badgeBorder: '#e2e8f0',
              feed: feed
            });
          });
        } else if ((!feed.aiBadges || feed.aiBadges.length === 0) && feed.type !== 'meeting' && feed.type !== 'issue' && feed.type !== 'vacation' && feed.type !== 'notice') {
          items.push({
            id: `${feed.id}_work_main`,
            feedId: feed.id,
            authorId: feed.authorId,
            authorName: feed.authorName,
            authorRole: feed.authorRole,
            authorAvatarPic: feed.authorAvatarPic,
            authorColor: feed.authorColor,
            timeDisplay: feed.timeDisplay,
            createdAt: feed.createdAt,
            category: '일반',
            title: feed.content,
            description: '',
            badgeText: '📄 일반',
            badgeColor: '#64748b',
            badgeBg: '#f8fafc',
            badgeBorder: '#e2e8f0',
            feed: feed
          });
        }
      }
    });

    // Guarantee 100% Calendar-Dashboard database synchronization:
    // If schedules contains requested tasks, approvals, or vacations not present in feeds, include them!
    if (schedules && schedules.length > 0) {
      schedules.forEach(s => {
        const isLeave = /반차|연차|휴가|병가/i.test(s.title || '') || s.category === '휴가';
        const isRequested = s.status === 'requested' || (s.isRequested && s.status !== 'accepted');
        
        if (isLeave || isRequested) {
          const alreadyInItems = items.some(it => {
            const matched = findMatchingSchedule(it);
            return (matched && matched.id === s.id) || (it.title && it.title.includes(s.title));
          });

          if (!alreadyInItems) {
            const author = displayMembers.find(m => m.id === s.requesterId || m.id === s.memberId) || { name: '정다음', role: '사원', id: 'daum' };
            const approver = displayMembers.find(m => m.id === s.approverId) || (isLeave ? { name: '조상무', role: '상무', id: 'sangmoo' } : { name: '정윤희', role: '부장', id: 'sh' });
            const dateFormatted = `${s.year}.${String(s.month).padStart(2, '0')}.${String(s.date).padStart(2, '0')}`;
            
            const syntheticFeed = {
              id: `feed_sched_${s.id}`,
              authorId: author.id,
              authorName: author.name,
              authorRole: author.role,
              authorAvatarPic: author.avatarPic || '/pic1_thumb.png',
              authorColor: author.color || '#000000',
              timeDisplay: '방금 전',
              createdAt: s.createdAt || new Date().toISOString(),
              content: s.title,
              likes: 0,
              hasLiked: false,
              cheers: 0,
              hasCheered: false,
              comments: []
            };

            if (categoryKey === 'all' || (isLeave && categoryKey === 'vacation') || (isRequested && categoryKey === 'vacation')) {
              items.push({
                id: `sched_feed_${s.id}`,
                feedId: `feed_sched_${s.id}`,
                authorId: author.id,
                authorName: author.name,
                authorRole: author.role,
                authorAvatarPic: author.avatarPic || '/pic1_thumb.png',
                authorColor: author.color || '#000000',
                timeDisplay: '방금 전',
                createdAt: s.createdAt || new Date().toISOString(),
                category: isLeave ? '휴가' : '요청',
                title: isLeave ? `🏖️ ${s.title} (${dateFormatted})` : `📋 ${s.title} (${approver.name} ${approver.role} 수락 요청)`,
                description: s.description || '',
                badgeText: s.status === 'accepted' ? '✅ 승인완료' : '🏖️ 결재요청',
                badgeColor: s.status === 'accepted' ? '#059669' : '#b45309',
                badgeBg: s.status === 'accepted' ? '#ecfdf5' : '#fffbeb',
                badgeBorder: s.status === 'accepted' ? '#a7f3d0' : '#fde68a',
                vacationInfo: {
                  type: isLeave ? s.title : '업무 요청',
                  date: dateFormatted,
                  status: s.status === 'accepted' ? 'approved' : (s.status === 'rejected' ? 'rejected' : 'pending'),
                  approverName: approver.name,
                  approverRole: approver.role,
                  targetUserId: approver.id,
                  requesterId: author.id,
                  requesterName: author.name,
                  approvedAt: null
                },
                matchedSchedule: s,
                feed: syntheticFeed
              });
            }
          }
        }
      });
    }

    if (selectedMemberId && selectedMemberId !== 'all') {
      return items.filter(item => item.authorId === selectedMemberId);
    }

    return items;
  };



  // Filtered feeds
  const filteredFeeds = feeds.filter(feed => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'issue') {
      return feed.type === 'issue' || feed.aiBadges?.some(b => b.category === '이슈');
    }
    if (activeFilter === 'vacation') {
      return feed.type === 'vacation' || !!feed.vacationInfo || feed.aiBadges?.some(b => b.category === '휴가');
    }
    if (activeFilter === 'meeting') {
      return feed.type === 'meeting' || feed.aiBadges?.some(b => b.category === '미팅');
    }
    if (activeFilter === 'notice') {
      return feed.type === 'notice' || feed.aiBadges?.some(b => b.category === '공지' || b.category === '전사공지') || feed.authorId === 'sangmoo';
    }
    if (activeFilter === 'sync') {
      return feed.type === 'daily_sync' || !!feed.authorId;
    }
    return true;
  });

  // Calculate statistics for sidebar and header tabs
  const pendingApprovalsCount = feeds.filter(f => f.vacationInfo && f.vacationInfo.status === 'pending').length;
  const activeIssues = feeds.filter(f => f.type === 'issue' || f.aiBadges?.some(b => b.category === '이슈'));

  // Quick prompt tag helper
  const addTagToComposer = (tag) => {
    setComposerText(prev => (prev ? `${prev} ${tag} ` : `${tag} `));
  };

  // Mini Gantt Helper: Get timeline blocks dynamically from schedules
  const baseMemberScheduleMap = {
    sh: [],
    sangmoo: [],
    daum: []
  };

  const getEventsForMemberAndDate = (memberId, dateObj) => {
    const baseEvents = baseMemberScheduleMap[memberId] || [];

    const dynamicEvents = (schedules || []).filter(s => {
      const matchesMember = s.memberIds ? s.memberIds.includes(memberId) : s.memberId === memberId;
      const sYear = s.year || dateObj.getFullYear();
      const sMonth = s.month || (dateObj.getMonth() + 1);
      const matchesDate = sYear === dateObj.getFullYear() && sMonth === (dateObj.getMonth() + 1) && s.date === dateObj.getDate();
      return matchesMember && matchesDate;
    }).map(s => {
      let bg = '#eef2ff', border = '#c7d2fe', text = '#3730a3', accent = '#6366f1';
      if (s.type === 'vacation' || s.title?.includes('반차') || s.title?.includes('휴가')) {
        bg = '#fffbeb'; border = '#fde68a'; text = '#92400e'; accent = '#f59e0b';
      } else if (s.type === 'issue' || s.title?.includes('에러') || s.title?.includes('장애')) {
        bg = '#fef2f2'; border = '#fecaca'; text = '#991b1b'; accent = '#ef4444';
      } else if (s.title?.includes('리뷰') || s.title?.includes('퍼블리싱')) {
        bg = '#f0f9ff'; border = '#bae6fd'; text = '#0369a1'; accent = '#0ea5e9';
      } else if (s.title?.includes('브리핑') || s.title?.includes('배포')) {
        bg = '#ecfdf5'; border = '#a7f3d0'; text = '#065f46'; accent = '#10b981';
      }
      return {
        title: s.title,
        start: s.startHour || 9,
        end: s.endHour || 11,
        bg, border, text, accent
      };
    });

    return [...baseEvents, ...dynamicEvents];
  };

  const totalTimelineEventsCount = ['sh', 'sangmoo', 'daum'].reduce((acc, mId) => {
    return acc + getEventsForMemberAndDate(mId, timelineDate).length;
  }, 0);

  // Generate Report Content
  const getDailyReportContent = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const dayStr = timelineDayNames[now.getDay()];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return `# 📋 [ZAL 모닝 데일리] ${y}.${m}.${d} (${dayStr}) 팀 업무 보고서

**작성 일시:** ${y}.${m}.${d} ${timeStr}
**작성자:** ${currentUser?.name || '정윤희'} ${currentUser?.role || '부장'}

---

## 1. 🚨 긴급 이슈 및 장애 현황
- **로그인 인증 세션 만료 에러 디버깅** (담당: 정다음 사원 / 09:00 ~ 14:00)
  * 현상: 일부 사용자 로그인 세션 토큰이 10분 만에 만료되는 이슈
  * 조치 계획: 세션 리프레시 로직 핫픽스 배포 후 정오 1차 브리핑

## 2. 🤝 금일 주요 미팅 및 협업 일정
- **10:00 ~ 11:30** 주간 기획 회의 (참석: 정윤희 부장, 조상무 상무)
- **14:00 ~ 15:00** 화면 퍼블리싱 리뷰 (참석: 정윤희 부장, 정다음 사원)
- **15:00 ~ 17:00** 임원 주간 경영 회의 (참석: 조상무 상무)

## 3. 🏖️ 휴가 및 근태 신청 현황
- 정다음 사원: **휴가 / 반차 신청** (${feeds.find(f => f.vacationInfo)?.vacationInfo?.status === 'approved' ? '✅ 조상무 상무 승인 완료' : '⏳ 결재 대기 중'})

## 4. 📌 중점 추진 업무
- 대신증권 연금 경쟁력 강화 시스템 연동 브리핑 자료 작성 (정윤희 부장)
- D-RPS 고도화 2차 기획 검토 (조상무 상무)
`;
  };

  const getWeeklyReportContent = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const day = now.getDate();
    const weekNum = Math.ceil(day / 7);

    const dayOfWeek = now.getDay();
    const distToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mon = new Date(y, now.getMonth(), day + distToMon);
    const fri = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4);

    const monStr = `${mon.getFullYear()}.${String(mon.getMonth() + 1).padStart(2, '0')}.${String(mon.getDate()).padStart(2, '0')}`;
    const friStr = `${fri.getFullYear()}.${String(fri.getMonth() + 1).padStart(2, '0')}.${String(fri.getDate()).padStart(2, '0')}`;

    return `# 📊 [ZAL 위클리] ${y}년 ${m}월 ${weekNum}주차 주간 업무 계획 보고서

**작성 기준:** ${monStr} (월) ~ ${friStr} (금)
**보고 부서:** 디지털 기획 / 개발 본부

---

### [팀별 주간 마일스톤]
1. **대신증권 연금 경쟁력 강화 프로젝트**
   - ${monStr}(월): 시스템 인터페이스 브리핑
   - 1차 개발 통합 테스트 및 QA 세션
2. **서비스 안정화 및 장애 제로화**
   - 로그인 인증 세션 핫픽스 적용
   - 모니터링 경보 체계 고도화
3. **팀 근태 및 휴가 계획**
   - 근태 및 휴가 일정 사전 조율 완료

### [임원 지시 및 협조 사항]
- 배포 전 회귀 테스트 철저 검증 요망 (조상무 상무)
`;
  };

  const handleCopyReport = () => {
    const content = reportModalType === 'weekly' ? getWeeklyReportContent() : getDailyReportContent();
    navigator.clipboard.writeText(content);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  return (
    <div className="dashboard-root" style={{
      flex: 1,
      height: '100%',
      backgroundColor: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'scroll',
      scrollbarGutter: 'stable',
      paddingTop: '32px',
      boxSizing: 'border-box',
      color: '#0f172a'
    }}>
      

      {/* ──── TOP MORNING COMPOSER AREA (PEEKING BI CHARACTER) ──── */}
      <div style={{
        maxWidth: '1360px',
        width: '100%',
        margin: '36px auto 0 auto',
        padding: '0 32px',
        boxSizing: 'border-box',
        position: 'relative'
      }}>
        {/* Peeking BI Character (zIndex: 1 - behind input box) */}
        <img
          src="/bi2.png"
          alt="잘됨이 BI"
          style={{
            position: 'absolute',
            left: '48px',
            bottom: '36px',
            height: '110px',
            width: 'auto',
            objectFit: 'contain',
            display: 'block',
            filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.06))',
            userSelect: 'none',
            pointerEvents: 'none',
            zIndex: 1
          }}
        />

        {/* Greeting & Login Info Row (zIndex: 30 - above input box so dropdowns render in front) */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          paddingLeft: '112px',
          marginBottom: '-27px',
          position: 'relative',
          zIndex: 30
        }}>
          {/* Left: Date + Greeting & Chips */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', margin: '0 0 45px 0' }}>
            <span style={{
              fontSize: '13px',
              fontWeight: '600',
              color: '#64748b',
              letterSpacing: '-0.2px',
              lineHeight: '1.2'
            }}>
              {formattedTodayHeader}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <h2 style={{
                fontSize: '19px',
                fontWeight: '800',
                color: '#0f172a',
                letterSpacing: '-0.4px',
                margin: 0,
                lineHeight: '1.25'
              }}>
                {(displayUser || currentUser)?.name || '정윤희'}님, 잘됨이와 뭐든 잘되는 하루 :-)
              </h2>

              {/* Quick Hashtag Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { label: '#긴급이슈', tag: '긴급 이슈 대응' },
                  { label: '#회식공지', tag: '금일 부서 회식 안내' },
                  { label: '#오전반차', tag: '오전 반차 신청' },
                  { label: '#오후반차', tag: '오후 반차 신청' }
                ].map(item => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      addTagToComposer(item.tag);
                      composerTextareaRef.current?.focus();
                    }}
                    style={{
                      padding: '2px 6px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      transition: 'color 0.15s ease',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#0f172a';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#94a3b8';
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: User Login Info & Project Controls (Lowered slightly with margin 0 0 38px 0, zIndex 30) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            margin: '0 0 38px 0',
            zIndex: 40
          }}>
            {/* 1. User Profile Trigger & Floating Dropdown */}
            <div ref={userMenuRef} style={{ position: 'relative' }}>
              <div
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsUserMenuOpen(prev => !prev);
                }}
                style={{
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  padding: '0 8px 0 4px',
                  borderRadius: '8px',
                  backgroundColor: isUserMenuOpen ? 'rgba(0, 0, 0, 0.04)' : 'transparent',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isUserMenuOpen) e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
                }}
                onMouseLeave={(e) => {
                  if (!isUserMenuOpen) e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title="사용자 메뉴 열기"
              >
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: (currentUser || displayUser)?.color || '#000000',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: '600',
                  overflow: 'hidden',
                  padding: 0,
                  border: '1px solid #e2e8f0',
                  flexShrink: 0
                }}>
                  <img src={(currentUser || displayUser)?.avatarPic || '/pic1_thumb.png'} alt={(currentUser || displayUser)?.name || '정윤희'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.2px' }}>
                  {(currentUser || displayUser)?.name || parsedUser.name || '정윤희'} {(currentUser || displayUser)?.role || parsedUser.role || '부장'}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: isUserMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    flexShrink: 0,
                    marginLeft: '2px'
                  }}
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>

              {/* Floating Profile Dropdown Layer */}
              {isUserMenuOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  minWidth: '200px',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1.5px solid #e2e8f0',
                  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.15), 0 4px 12px rgba(0, 0, 0, 0.05)',
                  zIndex: 9999,
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}>
                  <div style={{ padding: '6px 10px 4px 10px', fontSize: '11px', fontWeight: '800', color: '#94a3b8' }}>
                    계정 / 멤버 전환
                  </div>
                  {teamMembers.map(tm => (
                    <div
                      key={tm.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSwitchUser && onSwitchUser(tm);
                        setIsUserMenuOpen(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        fontSize: '12.5px',
                        fontWeight: (currentUser?.id || 'sh') === tm.id ? '800' : '600',
                        color: (currentUser?.id || 'sh') === tm.id ? '#6366f1' : '#334155',
                        backgroundColor: (currentUser?.id || 'sh') === tm.id ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        boxSizing: 'border-box'
                      }}
                    >
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tm.color || '#6366f1' }}></span>
                      <span>{(currentUser?.id || 'sh') === tm.id ? `나 (${tm.role || '팀원'})` : `${tm.name} (${tm.role || '팀원'})`}</span>
                      {(currentUser?.id || 'sh') === tm.id && <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '800' }}>✓</span>}
                    </div>
                  ))}

                  <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }}></div>

                  {/* Reset Data Option */}
                  {onResetData && (
                    <div
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsUserMenuOpen(false);
                        onResetData();
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        fontSize: '12.5px',
                        fontWeight: '700',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        transition: 'background-color 0.12s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="1 4 1 10 7 10"></polyline>
                        <polyline points="23 20 23 14 17 14"></polyline>
                        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                      </svg>
                      <span>시연 데이터 초기화</span>
                    </div>
                  )}

                  {/* Logout Option */}
                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsUserMenuOpen(false);
                      onLogout && onLogout();
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      fontWeight: '700',
                      color: '#334155',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      transition: 'background-color 0.12s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <polyline points="16 17 21 12 16 7"></polyline>
                      <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    <span>로그아웃</span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Custom Interactive Project Select Dropdown Card */}
            <div ref={projectMenuRef} style={{ position: 'relative' }}>
              <div
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsProjectMenuOpen(prev => !prev);
                }}
                style={{
                  height: '32px',
                  backgroundColor: isProjectMenuOpen ? 'rgba(0, 0, 0, 0.04)' : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0 8px 0 6px',
                  fontSize: '13px',
                  fontWeight: '800',
                  color: '#0f172a',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxSizing: 'border-box',
                  transition: 'background-color 0.15s ease',
                  userSelect: 'none'
                }}
                onMouseEnter={(e) => {
                  if (!isProjectMenuOpen) {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isProjectMenuOpen) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
                title="프로젝트 선택"
              >
                <span style={{
                  maxWidth: '200px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: '1'
                }}>
                  {headerSelectedProject === '전체' ? (parsedUser?.project || '대신증권 연금 경쟁력 강화') : headerSelectedProject}
                </span>

                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: isProjectMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>

              {/* Floating Options Layer */}
              {isProjectMenuOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  width: '260px',
                  backgroundColor: '#ffffff',
                  borderRadius: '14px',
                  border: '1.5px solid #e2e8f0',
                  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(0, 0, 0, 0.05)',
                  zIndex: 9999,
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  maxHeight: '320px',
                  overflowY: 'auto'
                }}>
                  {[
                    '전체',
                    '신영증권 외화표시펀드 매매 시스템 구축',
                    '삼성증권 연금 고객중심 서비스 개선',
                    'NH투자증권 퇴직연금시스템 운영',
                    '경찰공제회 시스템 유지보수',
                    '대신증권 연금 경쟁력 강화',
                    '다음 D-RPS 고도화',
                    '해당없음'
                  ].map((projOption) => {
                    const isSelected = headerSelectedProject === projOption || (headerSelectedProject === '전체' && projOption === '대신증권 연금 경쟁력 강화');
                    return (
                      <div
                        key={projOption}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectProject && onSelectProject(projOption);
                          setIsProjectMenuOpen(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '9px',
                          fontSize: '12.5px',
                          fontWeight: isSelected ? '800' : '600',
                          color: isSelected ? '#000000' : '#334155',
                          backgroundColor: isSelected ? '#f1f5f9' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          cursor: 'pointer',
                          userSelect: 'none',
                          boxSizing: 'border-box',
                          transition: 'all 0.12s ease',
                          lineHeight: '1.3'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <span>{projOption}</span>
                        {isSelected && (
                          <span style={{ fontWeight: '900', color: '#000000', fontSize: '14px', flexShrink: 0 }}>✓</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Input Box & Hashtags Area (zIndex: 2, background: #ffffff covers the lower half of the character) */}
        <div style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          {/* Middle: Integrated Quick Sync Input Box (Enlarged & Clear Placeholder) */}
          <div 
            onClick={() => !isSubmitting && composerTextareaRef.current?.focus()}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#ffffff',
              borderRadius: '26px',
              border: '1.5px solid',
              borderColor: isSubmitting ? '#0f172a' : (isInputFocused ? '#0f172a' : '#cbd5e1'),
              boxShadow: isSubmitting ? '0 0 0 1px #0f172a' : (isInputFocused ? '0 0 0 1px #0f172a' : 'none'),
              padding: '6px 8px 6px 22px',
              minHeight: '52px',
              height: '52px',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              width: '100%',
              boxSizing: 'border-box',
              cursor: isSubmitting ? 'default' : 'text',
              overflow: 'hidden'
            }}
          >
            <input
              ref={composerTextareaRef}
              type="text"
              value={composerText}
              disabled={isSubmitting}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              onChange={(e) => setComposerText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isSubmitting) {
                  handleComposerSubmit(e);
                }
              }}
              placeholder="오늘 진행할 주요 업무, 미팅, 긴급 이슈나 휴가 일정을 공유해 주세요"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: '15.5px',
                fontWeight: '500',
                color: '#0f172a',
                backgroundColor: 'transparent',
                height: '40px',
                lineHeight: '40px',
                padding: '0',
                opacity: isSubmitting ? 0 : 1
              }}
            />
            {/* Clear (Delete) button when text is inputted */}
            {composerText.length > 0 && !isSubmitting && (
              <button
                type="button"
                onClick={() => {
                  setComposerText('');
                  composerTextareaRef.current?.focus();
                }}
                title="입력 내용 지우기"
                style={{
                  width: '28px',
                  height: '28px',
                  padding: '0',
                  backgroundColor: 'rgba(148, 163, 184, 0.15)',
                  color: '#64748b',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                  marginRight: '6px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(148, 163, 184, 0.28)';
                  e.currentTarget.style.color = '#0f172a';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(148, 163, 184, 0.15)';
                  e.currentTarget.style.color = '#64748b';
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}

            <button
              type="button"
              onClick={handleComposerSubmit}
              disabled={!composerText.trim() || isSubmitting}
              title="등록 (Enter)"
              style={{
                width: '42px',
                height: '42px',
                padding: '0',
                backgroundColor: 'transparent',
                color: composerText.trim() ? '#000000' : '#cbd5e1',
                border: 'none',
                borderRadius: '50%',
                cursor: composerText.trim() ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                flexShrink: 0,
                opacity: isSubmitting ? 0 : 1
              }}
              onMouseEnter={(e) => {
                if (composerText.trim()) {
                  e.currentTarget.style.color = '#000000';
                  e.currentTarget.style.backgroundColor = '#f1f5f9';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = composerText.trim() ? '#000000' : '#cbd5e1';
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>

            {/* In-place Overlay Covering the Input Box directly during AI analysis */}
            {isSubmitting && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '0 20px',
                color: '#1e293b',
                fontSize: '14px',
                fontWeight: '600',
                zIndex: 10
              }}>
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="2.5"
                  style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
                >
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeLinecap="round" />
                </svg>
                <span>AI 잘됨이가 메시지를 분석하여 일정을 등록하고 있습니다...</span>
              </div>
            )}
          </div>

        </div>
      </div>

            {/* ──── FULL SCREEN WIDTH FILTER TABS DIVIDER (LEFT-ALIGNED, LARGER FONT) ──── */}
      <div style={{
        width: '100%',
        borderBottom: '1px solid #e2e8f0',
        margin: '28px 0 0 0',
        display: 'flex',
        justifyContent: 'center',
        boxSizing: 'border-box'
      }}>
        <div style={{
          maxWidth: '1360px',
          width: '100%',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '32px',
          boxSizing: 'border-box'
        }}>
          {[
            { key: 'all', label: '전체 피드' },
            { key: 'issue', label: '이슈' },
            { key: 'vacation', label: '요청' },
            { key: 'meeting', label: '회의' },
            { key: 'notice', label: '공지' },
            { key: 'general', label: '일반' }
          ].map(tab => {
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                className={`toggle-item ${isActive ? 'active-blue' : ''}`}
                onClick={() => setActiveFilter(tab.key)}
                style={{
                  position: 'relative',
                  padding: '8px 4px 14px 4px',
                  fontSize: '16px',
                  fontWeight: isActive ? '700' : '600',
                  color: isActive ? '#000000' : '#64748b',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  transition: 'color 0.15s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ──── FULL WIDTH DATE NAVIGATOR & MEMBER CHIPS HEADER BAR ──── */}
      <div style={{
        maxWidth: '1360px',
        width: '100%',
        margin: '0 auto',
        padding: '24px 32px 14px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxSizing: 'border-box'
      }}>
        {/* Left: Date Navigator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={handlePrevTimelineDate}
            style={{
              background: 'none',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              color: '#64748b',
              cursor: 'pointer',
              padding: '6px 8px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#ffffff',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f8fafc';
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.color = '#0f172a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#ffffff';
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.color = '#64748b';
            }}
            title="이전 날짜"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          <span style={{
            fontSize: '17px',
            fontWeight: '800',
            color: '#0f172a',
            letterSpacing: '-0.3px',
            padding: '0 4px',
            userSelect: 'none'
          }}>
            {formattedTimelineDate}
          </span>

          <button
            type="button"
            onClick={handleNextTimelineDate}
            style={{
              background: 'none',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              color: '#64748b',
              cursor: 'pointer',
              padding: '6px 8px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#ffffff',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f8fafc';
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.color = '#0f172a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#ffffff';
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.color = '#64748b';
            }}
            title="다음 날짜"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>

        {/* Right: Team Member Chips (Far right end of container) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setSelectedMemberId('all')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '5px 13px',
              borderRadius: '20px',
              fontSize: '12.5px',
              fontWeight: selectedMemberId === 'all' ? '800' : '600',
              backgroundColor: selectedMemberId === 'all' ? '#0f172a' : '#ffffff',
              color: selectedMemberId === 'all' ? '#ffffff' : '#64748b',
              border: selectedMemberId === 'all' ? '1px solid #0f172a' : '1px solid #e2e8f0',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (selectedMemberId !== 'all') {
                e.currentTarget.style.backgroundColor = '#f8fafc';
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.color = '#0f172a';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedMemberId !== 'all') {
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.color = '#64748b';
              }
            }}
          >
            <span>전체</span>
          </button>

          {displayMembers.map(tm => {
            const isSelected = selectedMemberId === tm.id;
            const isMe = (currentUser?.id || 'sh') === tm.id;
            const memberName = isMe ? '나' : tm.name;

            return (
              <button
                key={tm.id}
                type="button"
                onClick={() => setSelectedMemberId(prev => prev === tm.id ? 'all' : tm.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '5px 13px',
                  borderRadius: '20px',
                  fontSize: '12.5px',
                  fontWeight: isSelected ? '800' : '600',
                  backgroundColor: isSelected ? '#0f172a' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#64748b',
                  border: isSelected ? '1px solid #0f172a' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = '#f8fafc';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.color = '#0f172a';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.color = '#64748b';
                  }
                }}
              >
                <span>{memberName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ──── MAIN DASHBOARD CONTAINER (LEFT 2-COLUMN MASONRY + RIGHT FIXED SIDEBAR) ──── */}
      <div className="dashboard-layout-container" style={{ paddingTop: '8px' }}>
        
        {/* ════════ LEFT: 2-COLUMN FEED MASONRY GRID ════════ */}
        <section className="dashboard-feed-masonry">
            {(() => {
              const categoryItems = getCategoryItems(activeFilter);
            if (categoryItems.length === 0) {
              return (
                <div style={{
                  columnSpan: 'all',
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '40px 10px',
                  boxSizing: 'border-box'
                }}>
                  <div style={{
                    backgroundColor: '#ffffff',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '20px',
                    padding: '44px 32px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    width: '100%',
                    maxWidth: '440px',
                    boxShadow: '0 1px 4px rgba(15, 23, 42, 0.03)'
                  }}>
                    <div style={{ fontSize: '36px', marginBottom: '10px' }}>💬</div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#334155' }}>
                      해당 카테고리의 항목이 없습니다.
                    </div>
                    <div style={{ fontSize: '13px', marginTop: '6px', color: '#64748b' }}>
                      상단 입력창에 오늘의 일정을 등록해 보세요!
                    </div>
                  </div>
                </div>
              );
            }

            return categoryItems.map(item => {
              const parentFeed = item.feed || {
                id: item.feedId || item.id,
                likes: 0,
                hasLiked: false,
                cheers: 0,
                hasCheered: false,
                comments: []
              };
              const feedId = parentFeed.id || item.feedId || item.id;
              const isCommentOpen = !!expandedCommentFeedIds[feedId];
              const isPendingVacation = item.vacationInfo && item.vacationInfo.status === 'pending';
              const isApprovedVacation = item.vacationInfo && item.vacationInfo.status === 'approved';

              const isAuthor = item.authorId === (currentUser?.id || 'sh') ||
                               (currentUser?.id === 'sh' && item.authorId === 'yoonhee') ||
                               (currentUser?.id === 'sangmoo' && item.authorId === 'sangmu') ||
                               (currentUser?.id === 'daum' && (item.authorId === 'daeum' || item.authorId === 'daum'));

              const isRawExpanded = !!expandedRawCardIds[item.id];
              const rawContent = item.feed?.content || item.content || item.description;

              const matchedSched = findMatchingSchedule(item);

              let assigneeName = item.authorName || '정다음';
              if (matchedSched) {
                if (matchedSched.memberIds && matchedSched.memberIds.length > 0) {
                  const names = matchedSched.memberIds.map(id => {
                    const m = displayMembers.find(member => member.id === id || (id === 'yoonhee' && member.id === 'sh') || (id === 'daeum' && member.id === 'daum') || (id === 'sangmu' && member.id === 'sangmoo'));
                    return m ? m.name : id;
                  });
                  assigneeName = [...new Set(names)].join(', ');
                } else {
                  const member = displayMembers.find(m => m.id === matchedSched.memberId || (matchedSched.memberId === 'yoonhee' && m.id === 'sh') || (matchedSched.memberId === 'daeum' && m.id === 'daum') || (matchedSched.memberId === 'sangmu' && m.id === 'sangmoo'));
                  if (member) assigneeName = member.name;
                }
              } else if (item.vacationInfo?.requesterName) {
                assigneeName = item.vacationInfo.requesterName;
              }

              let dateStr = getTodayFormatted();
              if (matchedSched && matchedSched.date) {
                const y = matchedSched.year || today.getFullYear();
                const m = String(matchedSched.month || (today.getMonth() + 1)).padStart(2, '0');
                const d = String(matchedSched.date).padStart(2, '0');
                dateStr = `${y}.${m}.${d}`;
              } else if (item.vacationInfo?.date) {
                dateStr = item.vacationInfo.date;
              }

              let timeStr = '09:00 ~ 12:00';
              if (matchedSched && matchedSched.startHour !== undefined && matchedSched.endHour !== undefined) {
                timeStr = `${formatHour(matchedSched.startHour)} ~ ${formatHour(matchedSched.endHour)}`;
              } else if (item.vacationInfo) {
                if (/오후/i.test(item.vacationInfo.type || item.title || '')) {
                  timeStr = '14:00 ~ 18:00';
                } else if (/오전/i.test(item.vacationInfo.type || item.title || '')) {
                  timeStr = '09:00 ~ 14:00';
                } else {
                  timeStr = '09:00 ~ 18:00';
                }
              } else if (/리뷰|미팅|회의/i.test(item.title || '')) {
                timeStr = '14:00 ~ 15:00';
              } else if (/API|연동|개발/i.test(item.title || '')) {
                timeStr = '15:00 ~ 17:00';
              }

              return (
                <article
                  id={`card_${item.id}`}
                  key={item.id}
                  className={`masonry-card ${highlightedCardId === item.id || highlightedCardId === item.feedId ? 'deep-link-highlighted-card' : ''}`}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '16px',
                    border: '1.5px solid #e2e8f0',
                    boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
                    padding: '20px 22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    boxSizing: 'border-box',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(15, 23, 42, 0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.boxShadow = '0 2px 10px rgba(15, 23, 42, 0.03)';
                  }}
                >
                  {/* Header: Author Info + Category Status Badge & Share Button */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        backgroundColor: item.authorColor || '#6366f1',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1.5px solid #e2e8f0',
                        flexShrink: 0
                      }}>
                        <img
                          src={item.authorAvatarPic || '/pic1_thumb.png'}
                          alt={item.authorName}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14.5px', fontWeight: '800', color: '#0f172a' }}>
                            {item.authorId === (currentUser?.id || 'sh') ? '나' : item.authorName}
                          </span>
                          <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#64748b' }}>
                            {item.authorRole}
                          </span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '1px', fontWeight: '500' }}>
                          {item.timeDisplay}
                        </div>
                      </div>
                    </div>

                    {/* Right: Category Status Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {item.badgeText && (
                        <span style={{
                          padding: '4px 10px',
                          backgroundColor: item.badgeBg || '#f8fafc',
                          color: item.badgeColor || '#475569',
                          border: `1px solid ${item.badgeBorder || '#e2e8f0'}`,
                          borderRadius: '12px',
                          fontSize: '11.5px',
                          fontWeight: '700',
                          whiteSpace: 'nowrap'
                        }}>
                          {item.badgeText}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Main Content Area (Title + '원문보기' Button + Calendar-style Details) */}
                  <div
                    onClick={(e) => {
                      if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input') || e.target.closest('textarea')) {
                        return;
                      }
                      if (onOpenScheduleDetail) {
                        onOpenScheduleDetail(item);
                      }
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      cursor: onOpenScheduleDetail ? 'pointer' : 'default'
                    }}
                    title="클릭하여 일정 상세 및 수정 열기"
                  >
                    {/* Title Row & '원문보기' Button (제목 우측에 바로 붙여서 배치) */}
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div
                        style={{
                          fontSize: '14.5px',
                          color: '#0f172a',
                          lineHeight: '1.5',
                          fontWeight: '700',
                          letterSpacing: '-0.2px'
                        }}
                      >
                        {item.title}
                      </div>

                      {/* '원문보기' 버튼 (자기가 작성한 카드에만 제목 바로 우측에 표시) */}
                      {isAuthor && rawContent && (
                        <button
                          type="button"
                          onClick={(e) => toggleRawText(item.id, e)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '0 4px',
                            fontSize: '11.5px',
                            fontWeight: '600',
                            color: isRawExpanded ? '#2563eb' : '#64748b',
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            transition: 'color 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#1e293b';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = isRawExpanded ? '#2563eb' : '#64748b';
                          }}
                        >
                          <span>원문보기</span>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              transform: isRawExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s ease'
                            }}
                          >
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* 작성자만 볼 수 있는 펼침 원문 박스 */}
                    {isAuthor && isRawExpanded && rawContent && (
                      <div style={{
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        fontSize: '12.5px',
                        color: '#334155',
                        lineHeight: '1.55',
                        whiteSpace: 'pre-wrap',
                        fontWeight: '400'
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', marginBottom: '4px' }}>
                          💬 작성 원문
                        </div>
                        {rawContent}
                      </div>
                    )}

                    {/* 캘린더 카드 형식의 상세 정보 (담당, 날짜, 시간) */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      fontSize: '12.5px',
                      color: '#334155',
                      backgroundColor: '#ffffff',
                      border: '1px solid #f1f5f9',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      marginTop: '2px'
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', alignItems: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#64748b' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          <span>담당</span>
                        </div>
                        <div style={{ fontWeight: '700', color: '#0f172a' }}>{assigneeName}</div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', alignItems: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#64748b' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          <span>날짜</span>
                        </div>
                        <div style={{ fontWeight: '500', color: '#334155' }}>{dateStr}</div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', alignItems: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#64748b' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          <span>시간</span>
                        </div>
                        <div style={{ fontWeight: '500', color: '#334155' }}>{timeStr}</div>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Request Action Box (Vacation, Meeting, Work) */}
                  {(() => {
                    const itemTitleText = `${item.title || ''} ${matchedSched?.title || ''}`;
                    const isItemLeave = /반차|연차|휴가|병가/i.test(itemTitleText) || item.category === '휴가';
                    const isItemRequest = item.category === '요청' || (matchedSched && matchedSched.status === 'requested');

                    // If this item is NOT a leave request and NOT a requested task/meeting, NEVER show request action box!
                    if (!isItemLeave && !isItemRequest && (!matchedSched || matchedSched.status !== 'requested')) {
                      return null;
                    }

                    let vInfo = item.vacationInfo;
                    if (!vInfo && matchedSched) {
                      const isMultiAssigneeRequest = matchedSched.memberIds && matchedSched.memberIds.length > 1 && matchedSched.status === 'requested';
                      const isPendingRequest = matchedSched.status === 'requested' || (matchedSched.isRequested && matchedSched.status !== 'accepted');
                      const isExplicitApprovedRequest = (matchedSched.description || '').includes('[수락메시지]') || (matchedSched.description || '').includes('[승인 완료]');
                      const isExplicitRejectedRequest = (matchedSched.status === 'rejected' || (matchedSched.status && matchedSched.status.startsWith('rejected'))) && (isItemLeave || isMultiAssigneeRequest || (matchedSched.description || '').includes('[반려사유]'));

                      if (isPendingRequest || isExplicitApprovedRequest || isExplicitRejectedRequest || (isItemLeave && matchedSched.status === 'accepted')) {
                        vInfo = {
                          type: isItemLeave ? '휴가' : (matchedSched.category || '요청'),
                          date: dateStr,
                          status: matchedSched.status === 'accepted' ? 'approved' : (matchedSched.status === 'rejected' ? 'rejected' : 'pending'),
                          requesterId: matchedSched.requesterId || item.authorId,
                          requesterName: item.authorName
                        };
                      }
                    }

                    if (!vInfo) return null;
                    const isPending = vInfo.status === 'pending';
                    const isApproved = vInfo.status === 'approved';
                    const isRejected = vInfo.status === 'rejected';

                    // 1. Determine Approver accurately using the schedule model
                    let targetUserId = 'sangmoo';
                    let targetName = '조상무';
                    let targetRole = '상무';

                    if (matchedSched) {
                      if (matchedSched.approverId) {
                        targetUserId = matchedSched.approverId;
                      } else if (matchedSched.memberIds && matchedSched.memberIds.length > 1) {
                        const reqId = matchedSched.requesterId || item.authorId;
                        const otherId = matchedSched.memberIds.find(id => id !== reqId && !(reqId === 'sh' && id === 'yoonhee') && !(reqId === 'daum' && id === 'daeum') && !(reqId === 'sangmoo' && id === 'sangmu'));
                        if (otherId) targetUserId = otherId;
                      } else if (isItemLeave) {
                        targetUserId = 'sangmoo';
                      } else if (/정윤희|정부장|부장/i.test(matchedSched.title || '') || (matchedSched.requesterId === 'daum')) {
                        targetUserId = 'sh';
                      }
                    } else if (vInfo.targetUserId) {
                      targetUserId = vInfo.targetUserId;
                    } else if (isItemLeave) {
                      targetUserId = 'sangmoo';
                    } else if (/정윤희|정부장|부장/i.test(item.title || '')) {
                      targetUserId = 'sh';
                    } else if (/조상무|상무/i.test(item.title || '')) {
                      targetUserId = 'sangmoo';
                    } else {
                      targetUserId = (item.authorId === 'daum') ? 'sh' : 'sangmoo';
                    }

                    const foundTarget = displayMembers.find(m => m.id === targetUserId || (targetUserId === 'sh' && m.id === 'sh') || (targetUserId === 'daum' && m.id === 'daum') || (targetUserId === 'sangmoo' && m.id === 'sangmoo'));
                    if (foundTarget) {
                      targetName = foundTarget.name;
                      targetRole = foundTarget.role;
                    }

                    const targetDisplay = `${targetName || ''} ${targetRole || ''}`.trim();

                    const canApprove = (currentUser?.id === targetUserId) ||
                                       (targetUserId === 'sangmoo' && (currentUser?.id === 'sangmoo' || currentUser?.name === '조상무' || currentUser?.role === '상무')) ||
                                       (targetUserId === 'sh' && (currentUser?.id === 'sh' || currentUser?.name?.includes('정윤희') || currentUser?.role?.includes('부장'))) ||
                                       ((targetUserId === 'daum' || targetUserId === 'daeum') && (currentUser?.id === 'daum' || currentUser?.id === 'daeum' || currentUser?.name?.includes('정다음') || currentUser?.role?.includes('사원')));

                    if (isPending) {
                      if (canApprove) {
                        return (
                          <div style={{
                            backgroundColor: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '12px',
                            padding: '12px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px'
                          }}>
                            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', flex: 1, lineHeight: '1.4', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>⏳</span>
                              <span>{targetDisplay ? `승인 대기중 (${targetDisplay})` : '승인 대기중'}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={() => handleApproveVacation(parentFeed.id, false)}
                                style={{
                                  padding: '7px 14px',
                                  fontSize: '12px',
                                  fontWeight: '700',
                                  backgroundColor: '#fef2f2',
                                  color: '#dc2626',
                                  border: '1px solid #fca5a5',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                              >
                                요청반려
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApproveVacation(parentFeed.id, true)}
                                style={{
                                  padding: '7px 14px',
                                  fontSize: '12px',
                                  fontWeight: '700',
                                  backgroundColor: '#ecfdf5',
                                  color: '#059669',
                                  border: '1px solid #a7f3d0',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d1fae5'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ecfdf5'}
                              >
                                요청수락
                              </button>
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <div style={{
                            backgroundColor: '#fffbeb',
                            border: '1px solid #fde68a',
                            borderRadius: '10px',
                            padding: '10px 14px',
                            fontSize: '12px',
                            color: '#b45309',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <span>⏳</span>
                            <span>{targetDisplay ? `요청 대기중 (${targetDisplay}에게 요청)` : '요청 대기중'}</span>
                          </div>
                        );
                      }
                    }

                    if (isApproved) {
                      return (
                        <div style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          padding: '10px 14px',
                          fontSize: '12.5px',
                          fontWeight: '700',
                          color: '#0f172a',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <span>✅</span>
                          <span>{vInfo.approverName || '담당자'} 수락 완료 ({vInfo.type})</span>
                        </div>
                      );
                    }

                    if (isRejected) {
                      return (
                        <div style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          padding: '10px 14px',
                          fontSize: '12.5px',
                          fontWeight: '700',
                          color: '#0f172a',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <span>❌</span>
                          <span>{vInfo.approverName || '담당자'} 요청 반려됨</span>
                        </div>
                      );
                    }

                    return null;
                  })()}

                  {/* Feed Action Bar (Likes, Cheers, Comments) */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '10px',
                    borderTop: '1px solid #f1f5f9',
                    marginTop: '2px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleLike(parentFeed.id)}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: parentFeed.hasLiked ? '#eff6ff' : '#f8fafc',
                          color: parentFeed.hasLiked ? '#2563eb' : '#64748b',
                          border: `1px solid ${parentFeed.hasLiked ? '#bfdbfe' : '#e2e8f0'}`,
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>👍</span>
                        <span>{parentFeed.likes}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleCheer(parentFeed.id)}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: parentFeed.hasCheered ? '#fdf2f8' : '#f8fafc',
                          color: parentFeed.hasCheered ? '#db2777' : '#64748b',
                          border: `1px solid ${parentFeed.hasCheered ? '#fbcfe8' : '#e2e8f0'}`,
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>🔥</span>
                        <span>{parentFeed.cheers}</span>
                      </button>

                      {/* Share Link Button Placed Next to Like/Cheer */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShareCard(item);
                        }}
                        title="카카오톡/메신저 공유 링크 복사"
                        style={{
                          padding: '5px 10px',
                          backgroundColor: '#f8fafc',
                          color: '#64748b',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#eff6ff';
                          e.currentTarget.style.color = '#2563eb';
                          e.currentTarget.style.borderColor = '#bfdbfe';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8fafc';
                          e.currentTarget.style.color = '#64748b';
                          e.currentTarget.style.borderColor = '#e2e8f0';
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="18" cy="5" r="3"></circle>
                          <circle cx="6" cy="12" r="3"></circle>
                          <circle cx="18" cy="19" r="3"></circle>
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                        </svg>
                        <span>공유</span>
                      </button>

                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedCommentFeedIds(prev => ({ ...prev, [parentFeed.id]: !prev[parentFeed.id] }))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: isCommentOpen ? '#6366f1' : '#64748b',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 6px',
                        borderRadius: '6px'
                      }}
                    >
                      <span>댓글 {parentFeed.comments?.length || 0}</span>
                    </button>
                  </div>

                  {/* Comments Section */}
                  {isCommentOpen && (
                    <div style={{
                      marginTop: '4px',
                      paddingTop: '12px',
                      borderTop: '1px dashed #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      {parentFeed.comments?.map(c => (
                        <div
                          key={c.id}
                          style={{
                            backgroundColor: '#f8fafc',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                overflow: 'hidden',
                                backgroundColor: '#6366f1'
                              }}>
                                <img src={c.authorAvatarPic || '/pic2_thumb.png'} alt={c.authorName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                              <span style={{ fontSize: '12px', fontWeight: '800', color: '#0f172a' }}>
                                {c.authorId === (currentUser?.id || 'sh') ? '나' : c.authorName}
                              </span>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>
                                {c.authorRole}
                              </span>
                            </div>
                            <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                              {c.createdAt}
                            </span>
                          </div>
                          <p style={{ fontSize: '12.5px', color: '#334155', margin: 0, lineHeight: '1.45' }}>
                            {c.text}
                          </p>
                        </div>
                      ))}

                      {/* Inline Comment Input Box */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                        <input
                          type="text"
                          value={commentInputs[parentFeed.id] || ''}
                          onChange={(e) => handleCommentInputChange(parentFeed.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSubmitComment(parentFeed.id);
                            }
                          }}
                          placeholder="동료에게 응원이나 피드백 댓글을 남겨보세요..."
                          style={{
                            flex: 1,
                            padding: '7px 12px',
                            backgroundColor: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '10px',
                            fontSize: '12.5px',
                            outline: 'none',
                            color: '#0f172a'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSubmitComment(parentFeed.id)}
                          disabled={!commentInputs[parentFeed.id]?.trim()}
                          style={{
                            padding: '7px 12px',
                            backgroundColor: commentInputs[parentFeed.id]?.trim() ? '#6366f1' : '#e2e8f0',
                            color: commentInputs[parentFeed.id]?.trim() ? '#ffffff' : '#94a3b8',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: commentInputs[parentFeed.id]?.trim() ? 'pointer' : 'not-allowed'
                          }}
                        >
                          등록
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            });
          })()}
        </section>


        {/* ════════ RIGHT: EXPANDED VERTICAL TEAM TIMELINE (SYNC WEEKLY/DAILY STYLE) ════════ */}
        <aside className="dashboard-sidebar-column" style={{ width: '100%' }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1.5px solid #e2e8f0',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header: Title, Date, Live Badge & Link to Sync */}
            <div style={{
              padding: '16px 18px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#ffffff'
            }}>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '800',
                color: '#0f172a',
                margin: 0,
                letterSpacing: '-0.3px'
              }}>
                타임라인
              </h3>

              <button
                type="button"
                onClick={onNavigateToSync}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6366f1',
                  fontSize: '12.5px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  transition: 'color 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#4338ca'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#6366f1'}
                title="상세 싱크 간트 화면으로 이동"
              >
                <span>총 {totalTimelineEventsCount}개 일정 등록됨</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>

            {/* Vertical Timeline Table Grid */}
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '56px' }} />
                  <col style={{ width: 'calc((100% - 56px) / 3)' }} />
                  <col style={{ width: 'calc((100% - 56px) / 3)' }} />
                  <col style={{ width: 'calc((100% - 56px) / 3)' }} />
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                    <th style={{
                      padding: '10px 4px',
                      fontSize: '11px',
                      fontWeight: '700',
                      color: '#64748b',
                      textAlign: 'center',
                      borderRight: '1px solid #e2e8f0'
                    }}>
                      시간
                    </th>
                    {[
                      { id: 'sh', name: '정윤희', role: '부장', color: '#000000', avatar: '/pic1_thumb.png' },
                      { id: 'sangmoo', name: '조상무', role: '상무', color: '#6366f1', avatar: '/pic2_thumb.png' },
                      { id: 'daum', name: '정다음', role: '사원', color: '#10b981', avatar: '/pic2_thumb.png' }
                    ].map((m, idx) => (
                      <th key={m.id} style={{
                        padding: '8px 4px',
                        textAlign: 'center',
                        borderRight: idx < 2 ? '1px solid #e2e8f0' : 'none'
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                          <div style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            overflow: 'hidden',
                            backgroundColor: m.color,
                            border: '1px solid #cbd5e1'
                          }}>
                            <img src={m.avatar} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                          <span style={{ fontSize: '11.5px', fontWeight: '800', color: '#1e293b' }}>
                            {m.id === (currentUser?.id || 'sh') ? '나' : m.name}{' '}
                            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>{m.role}</span>
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((hour) => {
                    const membersList = [
                      { id: 'sh', name: '정윤희' },
                      { id: 'sangmoo', name: '조상무' },
                      { id: 'daum', name: '정다음' }
                    ];

                    const isNoon = hour === 12;

                    return (
                      <tr key={hour} style={{ height: '48px', borderBottom: '1px solid #f1f5f9' }}>
                        {/* Time Slot Label */}
                        <td style={{
                          padding: '0 4px',
                          textAlign: 'center',
                          fontSize: '11px',
                          fontWeight: '700',
                          color: '#64748b',
                          backgroundColor: '#fbfcfd',
                          borderRight: '1px solid #e2e8f0',
                          verticalAlign: 'top',
                          paddingTop: '6px'
                        }}>
                          {String(hour).padStart(2, '0')}:00
                        </td>

                        {/* 3 Members Hour Grid Cells */}
                        {membersList.map((m, mIdx) => {
                          // Find any event starting at this exact hour for this member
                          const events = getEventsForMemberAndDate(m.id, timelineDate);
                          const startingEvt = events.find(e => Math.floor(e.start) === hour);

                          return (
                            <td
                              key={m.id}
                              style={{
                                padding: '0',
                                position: 'relative',
                                verticalAlign: 'top',
                                borderRight: mIdx < 2 ? '1px solid #f1f5f9' : 'none',
                                backgroundColor: isNoon ? 'rgba(241, 245, 249, 0.4)' : 'transparent'
                              }}
                            >
                              {startingEvt && (() => {
                                const duration = startingEvt.end - startingEvt.start;
                                const heightPx = duration * 48 - 4;
                                const topOffset = (startingEvt.start - hour) * 48 + 2;

                                return (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onOpenScheduleDetail) {
                                        onOpenScheduleDetail(startingEvt);
                                      } else if (onNavigateToSync) {
                                        onNavigateToSync();
                                      }
                                    }}
                                    style={{
                                      position: 'absolute',
                                      top: `${topOffset}px`,
                                      left: '3px',
                                      right: '3px',
                                      height: `${heightPx}px`,
                                      backgroundColor: startingEvt.bg || '#f1f5f9',
                                      border: `1px solid ${startingEvt.border || '#cbd5e1'}`,
                                      borderLeft: `3.5px solid ${startingEvt.accent || startingEvt.text || '#6366f1'}`,
                                      color: startingEvt.text || '#0f172a',
                                      borderRadius: '6px',
                                      padding: '4px 6px',
                                      boxSizing: 'border-box',
                                      zIndex: 10,
                                      cursor: 'pointer',
                                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                                      overflow: 'hidden',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      justifyContent: 'flex-start',
                                      gap: '2px',
                                      transition: 'all 0.15s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.08)';
                                      e.currentTarget.style.transform = 'translateY(-1px)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
                                      e.currentTarget.style.transform = 'none';
                                    }}
                                    title={`${startingEvt.title} (${startingEvt.start}:00 ~ ${startingEvt.end}:00)`}
                                  >
                                    <div style={{
                                      fontSize: '11px',
                                      fontWeight: '800',
                                      lineHeight: '1.25',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      color: startingEvt.text || '#0f172a'
                                    }}>
                                      {startingEvt.title}
                                    </div>
                                    {duration >= 1 && (
                                      <div style={{
                                        fontSize: '9.5px',
                                        fontWeight: '700',
                                        opacity: 0.85,
                                        lineHeight: '1',
                                        color: startingEvt.text || '#64748b'
                                      }}>
                                        {String(Math.floor(startingEvt.start)).padStart(2, '0')}:00~{String(Math.ceil(startingEvt.end)).padStart(2, '0')}:00
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </aside>

      </div>

      {/* ──── REPORT PREVIEW MODAL DIALOG ──── */}
      {reportModalType && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            width: '680px',
            maxWidth: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            border: '1.5px solid #e2e8f0'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📋</span>
                <span style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
                  {reportModalType === 'weekly' ? '주간 업무 보고서 미리보기' : '일일 업무 보고서 미리보기'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReportModalType(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{
              padding: '24px',
              overflowY: 'auto',
              flex: 1,
              backgroundColor: '#ffffff'
            }}>
              <pre style={{
                fontFamily: 'Pretendard, -apple-system, sans-serif',
                fontSize: '13.5px',
                lineHeight: '1.7',
                color: '#1e293b',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
                backgroundColor: '#f8fafc',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0'
              }}>
                {reportModalType === 'weekly' ? getWeeklyReportContent() : getDailyReportContent()}
              </pre>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc'
            }}>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {copiedReport ? '✅ 클립보드에 복사되었습니다!' : '클릭하여 클립보드에 복사 후 슬랙/메일에 공유하세요.'}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setReportModalType(null)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={handleCopyReport}
                  style={{
                    padding: '8px 18px',
                    backgroundColor: copiedReport ? '#10b981' : '#6366f1',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{copiedReport ? '✓ 복사 완료' : '📋 클립보드 복사'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──── FLOATING TOAST NOTIFICATION (FOR DEEP-LINK COPY, ETC.) ──── */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#0f172a',
          color: '#ffffff',
          padding: '12px 24px',
          borderRadius: '30px',
          fontSize: '13.5px',
          fontWeight: '700',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.35)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 9999,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          pointerEvents: 'none',
          transition: 'all 0.2s ease'
        }}>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
