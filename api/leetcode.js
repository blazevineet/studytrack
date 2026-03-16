export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  try {
    // Get CSRF token first
    const loginPage = await fetch('https://leetcode.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const cookies = loginPage.headers.get('set-cookie') || '';
    const csrfMatch = cookies.match(/csrftoken=([^;]+)/);
    const csrf = csrfMatch ? csrfMatch[1] : '';
    const cookieStr = cookies.split(',').map(c => c.trim().split(';')[0]).join('; ');

    const query = `query getUserData($username: String!) {
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

    const gqlRes = await fetch('https://leetcode.com/graphql/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://leetcode.com/',
        'Origin': 'https://leetcode.com',
        'x-csrftoken': csrf,
        'Cookie': cookieStr,
      },
      body: JSON.stringify({ query, variables: { username } })
    });

    const data = await gqlRes.json();
    if (!data?.data?.matchedUser) return res.status(404).json({ error: `User "${username}" not found` });

    const user = data.data.matchedUser;
    const recent = data.data.recentAcSubmissionList || [];
    const contest = data.data.userContestRanking;

    const solved = {};
    (user.submitStats?.acSubmissionNum || []).forEach(s => { solved[s.difficulty] = s.count; });

    // Parse submission calendar for heatmap
    let calByDate = {};
    try {
      const cal = user.userCalendar?.submissionCalendar;
      if (cal) {
        const raw = JSON.parse(cal);
        Object.entries(raw).forEach(([ts, count]) => {
          const date = new Date(parseInt(ts) * 1000).toISOString().split('T')[0];
          calByDate[date] = count;
        });
      }
    } catch(e) {}

    // Group recent by date with problem details
    const byDate = {};
    recent.forEach(sub => {
      const date = new Date(parseInt(sub.timestamp) * 1000).toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push({ title: sub.title, slug: sub.titleSlug, lang: sub.lang });
    });

    return res.status(200).json({
      username: user.username,
      realName: user.profile?.realName || '',
      avatar: user.profile?.userAvatar || '',
      ranking: user.profile?.ranking || 0,
      streak: user.userCalendar?.streak || 0,
      totalActiveDays: user.userCalendar?.totalActiveDays || 0,
      solved: {
        easy: solved['Easy'] || 0,
        medium: solved['Medium'] || 0,
        hard: solved['Hard'] || 0,
        total: solved['All'] || 0,
      },
      calByDate,
      byDate,
      contest: contest ? {
        attended: contest.attendedContestsCount,
        rating: Math.round(contest.rating || 0),
        globalRanking: contest.globalRanking
      } : null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed: ' + err.message });
  }
}
