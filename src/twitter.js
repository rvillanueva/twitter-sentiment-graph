const Twitter = require('twitter');

const client = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  bearer_token: process.env.TWITTER_BEARER_TOKEN
})

function getMentions(term){
  return new Promise((resolve, reject) => {
    console.log('Getting mentions for ' + term);
    client.get('search/tweets', { q: term, count: 50 }, (err, data, res) => {
      if(err){
        return reject(err);
      }
      resolve(data.statuses);
    })
  })
}

function getTimelineByScreenName(screenName){
  return new Promise((resolve, reject) => {
    console.log('Getting timeline for ' + screenName);
    client.get('statuses/user_timeline', {
      screen_name: String(screenName),
      include_rts: true,
      exclude_replies: false,
      count: 50
    }, (err, timeline, res) => {
      if(err){
        return reject(err);
      }
      resolve(timeline);
    })
  })
}

module.exports = {
  getMentions: getMentions,
  getTimelineByScreenName: getTimelineByScreenName
}
