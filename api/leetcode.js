export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  try {
    // Use multiple public LeetCode APIs as fallbacks
    const apis = [
      `https://leetcode-stats-api.herokuapp.com/${username}`,
      `https://leetcode-api-faisalshohag.vercel.app/${username}`,
    ];

    let profileData = null;

    // Try each API until one works
    for (const url of apis) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(8000)
        });
        if (r.ok) {
          const d = await r.json();
          if (d && !d.error && (d.totalSolved !== undefined || d.totalSolved !== null)) {
            profileData = d;
            break;
          }
        }
      } catch(e) { continue; }
    }

    // Also try the GraphQL API
    const gqlQuery = `query getUserData($username: String!) {
      matchedUser(username: $username) {
        username
        profile { realName userAvatar ranking }
        submitStats { acSubmissionNum { difficulty count } }
        userCalendar { streak totalActiveDays submissionCalendar }
      }
      recentAcSubmissionList(username: $username, limit: 50) {
        id title titleSlug timestamp lang
      }
      userContestRanking(username: $username) {
        attendedContestsCount rating globalRanking
      }
    }`;

    let gqlData = null;
    try {
      const gqlRes = await fetch('https://leetcode.com/graphql/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://leetcode.com/',
          'Origin': 'https://leetcode.com',
        },
        body: JSON.stringify({ query: gqlQuery, variables: { username } }),
        signal: AbortSignal.timeout(10000)
      });
      if (gqlRes.ok) {
        const d = await gqlRes.json();
        if (d?.data?.matchedUser) gqlData = d.data;
      }
    } catch(e) {}

    // If neither worked
    if (!profileData && !gqlData) {
      return res.status(500).json({ 
        error: 'LeetCode is currently blocking API requests. This is a known LeetCode restriction. Try again in a few minutes.'
      });
    }

    // Build response from whatever data we got
    let solved = { easy: 0, medium: 0, hard: 0, total: 0 };
    let streak = 0, totalActiveDays = 0, calByDate = {}, byDate = {}, contest = null;
    let username_out = username, realName = '', avatar = '', ranking = 0;

    if (gqlData?.matchedUser) {
      const user = gqlData.matchedUser;
      username_out = user.username;
      realName = user.profile?.realName || '';
      avatar = user.profile?.userAvatar || '';
      ranking = user.profile?.ranking || 0;
      streak = user.userCalendar?.streak || 0;
      totalActiveDays = user.userCalendar?.totalActiveDays || 0;

      (user.submitStats?.acSubmissionNum || []).forEach(s => {
        solved[s.difficulty.toLowerCase()] = s.count;
        if (s.difficulty === 'All') solved.total = s.count;
      });

      try {
        const cal = user.userCalendar?.submissionCalendar;
        if (cal) {
          const raw = JSON.parse(cal);
          Object.entries(raw).forEach(([ts, cnt]) => {
            calByDate[new Date(parseInt(ts)*1000).toISOString().split('T')[0]] = cnt;
          });
        }
      } catch(e) {}

      const recent = gqlData.recentAcSubmissionList || [];
      recent.forEach(sub => {
        const date = new Date(parseInt(sub.timestamp)*1000).toISOString().split('T')[0];
        if (!byDate[date]) byDate[date] = [];
        if (!byDate[date].find(p => p.slug === sub.titleSlug))
          byDate[date].push({ title: sub.title, slug: sub.titleSlug, lang: sub.lang });
      });

      const c = gqlData.userContestRanking;
      if (c) contest = { attended: c.attendedContestsCount, rating: Math.round(c.rating||0), globalRanking: c.globalRanking };
    }

    if (profileData) {
      solved.easy = profileData.easySolved || solved.easy;
      solved.medium = profileData.mediumSolved || solved.medium;
      solved.hard = profileData.hardSolved || solved.hard;
      solved.total = profileData.totalSolved || solved.total;
      streak = profileData.streak || streak;
      totalActiveDays = profileData.totalActiveDays || totalActiveDays;
    }

    return res.status(200).json({
      username: username_out, realName, avatar, ranking,
      streak, totalActiveDays, solved, calByDate, byDate, contest
    });

  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + err.message });
  }
}
