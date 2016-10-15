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
  const users = responses.reduce((users, response) => {
      const
        [ time,
          name,
          team,
          levelStr,
          expStr,
          joggerStr,
          collectorStr
        ] = response
      if (name === 'Trainer Name' || !name) {
        return users
      }
      let exp = parseInt(expStr, 10)
      const level = parseInt(levelStr, 10)
      const jogger = parseFloat(joggerStr)
      const collector = parseInt(collectorStr)
      // e.g. 9/18/2016 1:52:07
      const timestamp = moment(time, "MM/DD/YYYY h:mm:ss")
      const safeName = name.trim().toLowerCase()

      const levelLower = levelToExp[level - 1]
      const levelHigher = levelToExp[level]

      if (exp < levelLower || exp > levelHigher) {
        console.log(`ERROR:\n${name}: Found level ${level} with ${exp} EXP`)
        console.log(`Reported level should have: ${levelLower} EXP to ${levelHigher} EXP`)
        console.log(`This EXP implies level ${
          levelToExp.findIndex((expected, index) => exp < expected ? index : false)}`)
        if (exp < levelDifferences[level]) {
          exp += levelLower
          console.log(`Autocorrecting exp to fit user-reported level: ${exp + levelLower} EXP`)
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
  const differences = Object.keys(users).reduce((differences, name) => {
    const user = users[name]
    if (user.length !== 2) {
      console.log(`ERROR: User ${name} has ${user.length} response${user.length > 1 ? 's' : ''}.`)
      return differences
    }
    const [ before, after ] = user

    const difference =
      { levelGain: after.level - before.level
      , expGain: after.exp - before.exp
      , signIn: before.timestamp.format('LT')
      , signOut: after.timestamp.format('LT')
      , minutes: Math.round(moment.duration(after.timestamp.diff(before.timestamp)).asMinutes())
      , name: before.name
      , jogged: after.jogger - before.jogger
      , collected: after.collector - before.collector
      , team: before.team
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

    differences[name] = difference
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
  const printUser = name => {
      const user = differences[name]
      console.log(
        `
        ${user.name} - lvl ${users[name][1].level} - ${user.team}
        -----------------------------------------
        From ${user.signIn} to ${user.signOut} (${user.minutes} minutes)
        EXP Gain: ${user.expGain} EXP
        Collected: ${user.collected} Pokémon
        Jogged: ${user.jogged.toFixed(3)} km
        ${user.levelGain ? `Level gain: ${user.levelGain}` : ''}
        `
      )
    }

  const printMost = (property, list) => {
    console.log(`\n~~~~~~~~~~ THE BEST ${property.toUpperCase()}S ~~~~~~~~~~\n`)
    list.slice(0, 5).forEach((name, number) => {
      console.log(`#${number + 1} ${property}:`)
      printUser(name)
    })
  }
  const most = property => (a, b) => differences[b][property] - differences[a][property]
  
  const mostJogged = [...names.sort(most('jogged'))]
  const mostCollected = [...names.sort(most('collected'))]
  const mostExpGain = [...names.sort(most('expGain'))]
  const mostLevelGain = [...names.sort(most('levelGain'))]

  printMost('jogger', mostJogged)
  printMost('collector', mostCollected)
  printMost('exp gain', mostExpGain)
  printMost('level gain', mostLevelGain)

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

  console.log('Random pool', randomWinnerPool)
  console.log('Suggestion:', randomWinnerPool[
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
  console.log(`${total} trainers joined us today.`)
  console.log(`Instinct: ${teamCounts.instinct} (${(100 * teamCounts.instinct / total).toFixed(2)}%)`)
  console.log(`Valor: ${teamCounts.valor} (${(100 * teamCounts.valor / total).toFixed(2)}%)`)
  console.log(`Mystic: ${teamCounts.mystic} (${(100 * teamCounts.mystic / total).toFixed(2)}%)`)
  console.log(`\n\nTogether we: (average in brackets)
    - Collected ${totalOf(names)('collected')} Pokémon (${(totalOf(names)('collected') / names.length).toFixed(2)})
        * Instinct: ${totalOf(teamInstinct)('collected')} (${(totalOf(teamInstinct)('collected') / teamInstinct.length).toFixed(2)})
        * Mystic:   ${totalOf(teamMystic)('collected')} (${(totalOf(teamMystic)('collected') / teamMystic.length).toFixed(2)})
        * Valor:    ${totalOf(teamValor)('collected')} (${(totalOf(teamValor)('collected') / teamValor.length).toFixed(2)})
    - Jogged ${totalOf(names)('jogged').toFixed(3)} km (${(totalOf(names)('jogged') / names.length).toFixed(3)})
        * Instinct: ${totalOf(teamInstinct)('jogged').toFixed(3)} km (${(totalOf(teamInstinct)('jogged') / teamInstinct.length).toFixed(3)})
        * Mystic:   ${totalOf(teamMystic)('jogged').toFixed(3)} km (${(totalOf(teamMystic)('jogged') / teamMystic.length).toFixed(3)})
        * Valor:    ${totalOf(teamValor)('jogged').toFixed(3)} km (${(totalOf(teamValor)('jogged') / teamValor.length).toFixed(3)})
    - Gained ${totalOf(names)('expGain')} EXP (${(totalOf(names)('expGain') / names.length).toFixed(0)})
        * Instinct: ${totalOf(teamInstinct)('expGain')} EXP (${(totalOf(teamInstinct)('expGain') / teamInstinct.length).toFixed(0)})
        * Mystic:   ${totalOf(teamMystic)('expGain')} EXP (${(totalOf(teamMystic)('expGain') / teamMystic.length).toFixed(0)})
        * Valor:    ${totalOf(teamValor)('expGain')} EXP (${(totalOf(teamValor)('expGain') / teamValor.length).toFixed(0)})
    - Grew ${totalOf(names)('levelGain')} levels (${(totalOf(names)('levelGain') / names.length).toFixed(1)})
        * Instinct: ${totalOf(teamInstinct)('levelGain')} (${(totalOf(teamInstinct)('levelGain') / teamInstinct.length).toFixed(1)})
        * Mystic:   ${totalOf(teamMystic)('levelGain')} (${(totalOf(teamMystic)('levelGain') / teamMystic.length).toFixed(1)})
        * Valor:    ${totalOf(teamValor)('levelGain')} (${(totalOf(teamValor)('levelGain') / teamValor.length).toFixed(1)})
    - Played for ${totalOf(names)('minutes')} minutes (${(totalOf(names)('minutes') / names.length).toFixed(1)})
        * Instinct: ${totalOf(teamInstinct)('minutes')} minutes (${(totalOf(teamInstinct)('minutes') / teamInstinct.length).toFixed(1)})
        * Mystic:   ${totalOf(teamMystic)('minutes')} minutes (${(totalOf(teamMystic)('minutes') / teamMystic.length).toFixed(1)})
        * Valor:    ${totalOf(teamValor)('minutes')} minutes (${(totalOf(teamValor)('minutes') / teamValor.length).toFixed(1)})
  `)
})

fs.createReadStream(__dirname + '/responses.csv').pipe(parser)
