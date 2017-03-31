const fs = require('fs')
const { parse } = require('csv')
const moment = require('moment')

const levelDifferences =
  [ 1000 // 1
  , 2000
  , 3000
  , 4000
  , 5000
  , 6000
  , 7000
  , 8000
  , 9000
  , 10000 // 10
  , 10000
  , 10000
  , 10000
  , 15000
  , 20000
  , 20000
  , 20000
  , 25000
  , 25000
  , 50000 // 20
  , 75000
  , 100000
  , 125000
  , 150000
  , 190000
  , 200000
  , 250000
  , 300000
  , 350000
  , 500000 // 30
  , 500000
  , 750000
  , 1000000
  , 1250000
  , 1500000
  , 2000000
  , 2500000
  , 3000000
  , 5000000 // 39
  ]
const levelToExp = levelDifferences.reduce((result, current) => {
    result.push(current + result[result.length - 1])
    return result
  }, [0])

const parser = parse({delimiter: ','}, function (err, responses) {
  console.log('```')
  console.log('Runtime debug:')
  const users = responses.reduce((users, response) => {
      const
        [ time,
          name,
          levelStr,
          team,
          expStr,
          xpScreen,
          collectorStr,
          collectorScreen,
          joggerStr,
          joggerBadge
        ] = response
      if (name === 'Trainer Name' || !name) {
        return users
      }
      let exp = parseInt(expStr, 10)
      const level = parseInt(levelStr, 10)
      const jogger = parseFloat(joggerStr)
      const collector = parseInt(collectorStr)
      // e.g. 9/18/2016 1:52:07
      const timestamp = moment(time, "YYYY-MM-DD h:mm:ss")
      const safeName = name.trim().toLowerCase()

      const levelLower = levelToExp[level - 1]
      const levelHigher = levelToExp[level]

      if (exp < levelLower || exp > levelHigher) {
        console.log(`ERROR:\n${name}: Found level ${level} with ${exp} EXP`)
        console.log(`Reported level should have: ${levelLower} EXP to ${levelHigher} EXP`)
        console.log(`This EXP implies level ${
          levelToExp.findIndex((expected, index) => exp < expected ? index : false)}`)
        if (exp < levelDifferences[level - 1]) {
          exp += levelLower
          console.log(`Autocorrecting exp to fit user-reported level: ${exp} EXP`)
        } else {
          console.log('I do not know how to fix this.')
        }
        console.log()
      }

      const stats =
        { timestamp
        , name
        , team
        , level
        , exp
        , jogger
        , collector
        }
      if (!(safeName in users)) {
        users[safeName] = [ stats ]
      } else {
        users[safeName].push(stats)
      }
      return users
    }, {})
  const invalidUsers = []
  const stats = ['expGain', 'jogged', 'collected']
  const highest = stats.reduce((highest, stat) => {
    highest[stat] = 0
    return highest
  }, {})
  const differences = Object.keys(users).reduce((differences, name) => {
    const user = users[name]
    if (user.length !== 2) {
      console.log(`ERROR: User ${name} has ${user.length} response${user.length > 1 ? 's' : ''}.`)
      invalidUsers.push([name, user.length])
      return differences
    }
    const [ before, after ] = user
    const minutes = Math.round(moment.duration(after.timestamp.diff(before.timestamp)).asMinutes())
    const multiplier = minutes > 120 ?
      120 / minutes : 1.0
    const expGain = after.exp - before.exp
    const jogged = after.jogger - before.jogger
    const collected = after.collector - before.collector

    const difference =
      { levelGain: after.level - before.level
      , expGain: expGain * multiplier
      , realGain: expGain
      , signIn: before.timestamp.format('LT')
      , signOut: after.timestamp.format('LT')
      , minutes
      , overtime: minutes - 120
      , name: before.name
      , jogged: jogged * multiplier
      , realJogged: jogged
      , collected: collected * multiplier
      , realCollected: collected
      , team: before.team
      , multiplier
      , ratio: {}
      }

    // Validation
    let valid = true
    if (difference.levelGain < 0) {
      console.log(`ERROR: User ${name} went down levels.`)
      valid = false
    }
    if (difference.expGain < 0) {
      console.log(`ERROR: User ${name} lost exp.`)
      valid = false
    }
    if (difference.minutes < 0) {
      console.log(`ERROR: User ${name}'s time went backwards.`)
      valid = false
    }
    if (difference.jogged < 0) {
      console.log(`ERROR: User ${name} lost KMs.`)
      valid = false
    }
    if (difference.collected < 0) {
      console.log(`ERROR: User ${name} caught negative Pokemon.`)
      valid = false
    }
    if (before.team !== after.team) {
      console.log(`ERROR: User ${name} switched teams (${before.team} to ${after.team})`)
      valid = false
    }
    difference.valid = valid
    if (valid) {
      differences[name] = difference
      stats.forEach(stat => {
        highest[stat] = Math.max(highest[stat], difference[stat])
      })
    }
    return differences
  }, {})

  const names = Object.keys(differences)
  const teamCounts = names.reduce((teams, name) => {
    const team = differences[name].team.toLowerCase()
    if (team.includes('instinct')) {
      teams.instinct += 1
    } else if (team.includes('valor')) {
      teams.valor += 1
    } else if (team.includes('mystic')) {
      teams.mystic += 1
    } else {
      console.log(`Unknown team!? ${team}`)
    }
    return teams
  }, { instinct: 0, valor: 0, mystic: 0 })
  let highestRating = 0
  names.forEach(name => {
    stats.forEach(stat => {
      differences[name].ratio[stat] = differences[name][stat] / highest[stat]
    })
    const rating = stats.reduce(
      (rating, stat) => rating * differences[name].ratio[stat], 1
    ) * 100
    differences[name].rating = rating
    if (rating > highestRating) {
      highestRating = rating
    }
  })
  // This code normalizes so that top % is 100%
  names.forEach(name => {
    differences[name].rating =
      differences[name].rating / highestRating * 100
  })

  console.log('End debug.')
  console.log('```\n')

  const printUser = name => {
      const user = differences[name]
      const real = user.multiplier === 1.0
      if (!user) return
      console.log(
        `
${user.name} - lvl ${users[name][1].level} - ${user.team}
-----------------------------------------

- From ${user.signIn} to ${user.signOut} (${user.minutes} minutes)
- **Multiplier**: ${user.multiplier.toFixed(2)} ${real ? '' : `(overtime: ${user.overtime} minutes)`}
- **Overall Rating**: ${user.rating.toFixed(2)}%
- **EXP Gain**: ${Math.round(user.expGain)} EXP${real ? '' :
  `\t(Scaled from: ${Math.round(user.realGain)})`}
- **Collected**: ${Math.round(user.collected)} Pokémon${real ? '' :
  `\t(Scaled from: ${Math.round(user.realCollected)})`}
- **Jogged**: ${user.jogged.toFixed(3)} km${real ? '' :
  `\t(Scaled from: ${user.realJogged.toFixed(3)})`}
${user.levelGain ? `- **Level gain**: ${user.levelGain}\n` : ''}`
      )
    }

  const printMost = (property, list) => {
    console.log(`\n# The best ${property}s\n`)
    list.slice(0, 5).forEach((name, number) => {
      console.log(`### #${number + 1} ${property}`)
      printUser(name)
    })
  }
  const most = property => (a, b) => differences[b][property] - differences[a][property]
  
  const mostJogged = [...names.sort(most('jogged'))]
  const mostCollected = [...names.sort(most('collected'))]
  const mostExpGain = [...names.sort(most('expGain'))]
  const mostLevelGain = [...names.sort(most('levelGain'))]
  const highestRatio = [...names.sort(most('rating'))]

  printMost('jogger', mostJogged)
  printMost('collector', mostCollected)
  printMost('exp gain', mostExpGain)
  printMost('level gain', mostLevelGain)
  printMost('ratio', highestRatio)

  const randomWinnerPool = names.filter(name => {
    // Winner must have played for 2 hours
    if (differences[name].minutes < 90) {
      return false
    }
    // Winner shouldn't be top of any other competitive category
    return !([ mostJogged, mostCollected, mostExpGain ].some(category => {
      if (category[0] === name || category[1] === name) {
        return true
      }
    }))
  })

  const printUsernames = usernames => usernames.forEach(name => console.log(`- ${name}`))

  console.log(`\n~~~~~~~~~~ INVALID NUMBER OF RESPONSES ~~~~~~~~~~\n`)
  printUsernames(invalidUsers.sort())

  console.log(`\n~~~~~~~~~~ THE RANDOM PRIZE ~~~~~~~~~~\n`)

  console.log('Picking from:')
  printUsernames(randomWinnerPool.sort())
  console.log('\nSuggestion:', randomWinnerPool[
      Math.floor((Math.random() * randomWinnerPool.length))
    ]
  )

  const totalOf = group => property =>
    group.reduce((total, name) => differences[name][property] + total, 0)
  const teamValor = names.filter(name => differences[name].team.toLowerCase().includes('valor'))
  const teamMystic = names.filter(name => differences[name].team.toLowerCase().includes('mystic'))
  const teamInstinct = names.filter(name => differences[name].team.toLowerCase().includes('instinct'))

  console.log('\n\n~~~~~~ Team Divide ~~~~~~')
  const total = names.length
  console.log(`${total} trainers joined us today (an additional ${invalidUsers.length} did not check in twice)`)
  console.log(`Instinct: ${teamCounts.instinct} (${(100 * teamCounts.instinct / total).toFixed(2)}%)`)
  console.log(`Valor: ${teamCounts.valor} (${(100 * teamCounts.valor / total).toFixed(2)}%)`)
  console.log(`Mystic: ${teamCounts.mystic} (${(100 * teamCounts.mystic / total).toFixed(2)}%)`)
  console.log(`\n\nTogether we: (average in brackets)
    - Collected ${Math.round(totalOf(names)('collected'))} Pokémon (${(totalOf(names)('collected') / names.length).toFixed(2)} ea)
        * Instinct: ${Math.round(totalOf(teamInstinct)('collected'))} (${(totalOf(teamInstinct)('collected') / teamInstinct.length).toFixed(2)} ea)
        * Mystic:   ${Math.round(totalOf(teamMystic)('collected'))} (${(totalOf(teamMystic)('collected') / teamMystic.length).toFixed(2)} ea)
        * Valor:    ${Math.round(totalOf(teamValor)('collected'))} (${(totalOf(teamValor)('collected') / teamValor.length).toFixed(2)} ea)
    - Jogged ${totalOf(names)('jogged').toFixed(3)} km (${(totalOf(names)('jogged') / names.length).toFixed(3)} ea)
        * Instinct: ${totalOf(teamInstinct)('jogged').toFixed(3)} km (${(totalOf(teamInstinct)('jogged') / teamInstinct.length).toFixed(3)} ea)
        * Mystic:   ${totalOf(teamMystic)('jogged').toFixed(3)} km (${(totalOf(teamMystic)('jogged') / teamMystic.length).toFixed(3)} ea)
        * Valor:    ${totalOf(teamValor)('jogged').toFixed(3)} km (${(totalOf(teamValor)('jogged') / teamValor.length).toFixed(3)} ea)
    - Gained ${Math.round(totalOf(names)('expGain'))} EXP (${(totalOf(names)('expGain') / names.length).toFixed(0)} ea)
        * Instinct: ${Math.round(totalOf(teamInstinct)('expGain'))} EXP (${(totalOf(teamInstinct)('expGain') / teamInstinct.length).toFixed(0)} ea)
        * Mystic:   ${Math.round(totalOf(teamMystic)('expGain'))} EXP (${(totalOf(teamMystic)('expGain') / teamMystic.length).toFixed(0)} ea)
        * Valor:    ${Math.round(totalOf(teamValor)('expGain'))} EXP (${(totalOf(teamValor)('expGain') / teamValor.length).toFixed(0)} ea)
    - Grew ${totalOf(names)('levelGain')} levels (${(totalOf(names)('levelGain') / names.length).toFixed(1)} ea)
        * Instinct: ${totalOf(teamInstinct)('levelGain')} (${(totalOf(teamInstinct)('levelGain') / teamInstinct.length).toFixed(1)} ea)
        * Mystic:   ${totalOf(teamMystic)('levelGain')} (${(totalOf(teamMystic)('levelGain') / teamMystic.length).toFixed(1)} ea)
        * Valor:    ${totalOf(teamValor)('levelGain')} (${(totalOf(teamValor)('levelGain') / teamValor.length).toFixed(1)} ea)
    - Played for ${totalOf(names)('minutes')} minutes (${(totalOf(names)('minutes') / names.length).toFixed(1)} ea)
        * Instinct: ${totalOf(teamInstinct)('minutes')} minutes (${(totalOf(teamInstinct)('minutes') / teamInstinct.length).toFixed(1)} ea)
        * Mystic:   ${totalOf(teamMystic)('minutes')} minutes (${(totalOf(teamMystic)('minutes') / teamMystic.length).toFixed(1)} ea)
        * Valor:    ${totalOf(teamValor)('minutes')} minutes (${(totalOf(teamValor)('minutes') / teamValor.length).toFixed(1)} ea)
  `)

  const printAll = users => users.forEach(name => printUser(name))
  printAll(Object.keys(differences).sort())

})

fs.createReadStream(__dirname + '/responses.csv').pipe(parser)
