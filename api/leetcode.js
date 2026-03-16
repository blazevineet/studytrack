export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  try {
    // LeetCode GraphQL API
    const query = `
      query getUserProfile($username: String!) {
        matchedUser(username: $username) {
          username
          profile { realName userAvatar ranking }
          submitStats {
            acSubmissionNum {
              difficulty
              count
              submissions
            }
          }
        }
        recentAcSubmissionList(username: $username, limit: 50) {
          id
          title
          titleSlug
          timestamp
          lang
          topicTags { name slug }
        }
        userContestRanking(username: $username) {
          attendedContestsCount
          rating
          globalRanking
        }
      }
    `;

    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://leetcode.com',
        'Origin': 'https://leetcode.com',
      },
      body: JSON.stringify({ query, variables: { username } })
    });

    const data = await response.json();

    if (data.errors || !data.data?.matchedUser) {
      return res.status(404).json({ error: 'LeetCode user not found' });
    }

    const user = data.data.matchedUser;
    const recent = data.data.recentAcSubmissionList || [];
    const contest = data.data.userContestRanking;

    // Process recent submissions — group by date and topic
    const byDate = {};
    const byTopic = {};

    recent.forEach(sub => {
      const date = new Date(parseInt(sub.timestamp) * 1000).toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push({ title: sub.title, slug: sub.titleSlug, lang: sub.lang });

      // Group by topic tags
      (sub.topicTags || []).forEach(tag => {
        if (!byTopic[tag.name]) byTopic[tag.name] = 0;
        byTopic[tag.name]++;
      });
    });

    // Get total solved per difficulty
    const solved = {};
    (user.submitStats?.acSubmissionNum || []).forEach(s => {
      solved[s.difficulty] = s.count;
    });

    return res.status(200).json({
      username: user.username,
      realName: user.profile?.realName || '',
      avatar: user.profile?.userAvatar || '',
      ranking: user.profile?.ranking || 0,
      solved: {
        easy: solved['Easy'] || 0,
        medium: solved['Medium'] || 0,
        hard: solved['Hard'] || 0,
        total: solved['All'] || 0,
      },
      byDate,   // { "2026-03-16": [{title, slug, lang}] }
      byTopic,  // { "Array": 12, "Dynamic Programming": 5 }
      contest: contest ? {
        attended: contest.attendedContestsCount,
        rating: Math.round(contest.rating || 0),
        globalRanking: contest.globalRanking
      } : null,
      recentCount: recent.length
    });

  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch LeetCode data: ' + err.message });
  }
}
