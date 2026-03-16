export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  try {
    // Try fetching user profile via LeetCode GraphQL
    const query = `
      query getUserData($username: String!) {
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
      }
    `;

    const gqlRes = await fetch('https://leetcode.com/graphql/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://leetcode.com/problems/',
        'Origin': 'https://leetcode.com',
        'x-csrftoken': 'abcdef',
        'Cookie': 'csrftoken=abcdef;',
      },
      body: JSON.stringify({ query, variables: { username } })
    });

    if (!gqlRes.ok) {
      throw new Error(`LeetCode API returned ${gqlRes.status}`);
    }

    const data = await gqlRes.json();

    if (data.errors) {
      throw new Error(data.errors[0]?.message || 'GraphQL error');
    }

    if (!data?.data?.matchedUser) {
      return res.status(404).json({ error: `User "${username}" not found on LeetCode. Check your username.` });
    }

    const user = data.data.matchedUser;
    const recent = data.data.recentAcSubmissionList || [];
    const contest = data.data.userContestRanking;

    // Solved counts
    const solved = {};
    (user.submitStats?.acSubmissionNum || []).forEach(s => { solved[s.difficulty] = s.count; });

    // Parse submission calendar
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

    // Group recent submissions by date
    const byDate = {};
    recent.forEach(sub => {
      const date = new Date(parseInt(sub.timestamp) * 1000).toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = [];
      // Avoid duplicates
      if (!byDate[date].find(p => p.slug === sub.titleSlug)) {
        byDate[date].push({ title: sub.title, slug: sub.titleSlug, lang: sub.lang });
      }
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
    console.error('LeetCode API error:', err);
    return res.status(500).json({ 
      error: `Failed to fetch LeetCode data: ${err.message}. LeetCode may be temporarily blocking requests — try again in a minute.`
    });
  }
}
