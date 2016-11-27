import {EventEmitter} from 'events'
import fs from 'fs'
import pty from 'pty.js'
import t2p from 'thunk-to-promise'
import yargs from 'yargs'
require('loud-rejection')()

function record(args) {
	const shell = process.env.SHELL || 'sh'
	const term = pty.spawn(shell, [], {
		name: 'xterm-color',
		cols: process.stdout.columns,
		rows: process.stdout.rows,
		stdio: [ 'pipe', 'pipe', 'pipe'],
		cwd: process.env.HOME,
		env: Object.assign({}, process.env, { TMUX: 'true' }),
	})

	const frames = [ ]
	const now = new Date().getTime()

	process.stdin.setRawMode(true)
	process.stdin.pipe(term)
	term.pipe(process.stdout)
	term.on('data', d => frames.push({ time: new Date().getTime() - now, data: new Buffer(d) }))
	term.on('close', async () => {
		const outFile = args._[1]
		console.error('ttycast.js: complete, writing to', args._[1])
		await t2p(done => fs.writeFile(outFile, JSON.stringify(frames), 'utf-8', done))
		process.exit()
	})
}

async function play(args) {
	const ee = new EventEmitter()
	ee.paused = false
	process.stdin.setRawMode(true)
	process.stdin.setEncoding('utf-8')
	process.stdin.on('data', key => {
		if (key == '\u0003') {
			process.exit()
		} else if (key == ' ') {
			ee.paused = !ee.paused
			ee.emit(ee.paused ? 'pause' : 'play')
		}
	})

	const fileName = args._[1]
	const frames = JSON.parse(await t2p(done => fs.readFile(fileName, 'utf-8', done)))
	let last = 0
	while (frames.length > 0) {
		if (ee.paused)
			await new Promise(y => ee.on('play', y))
		const [ frame ] = frames.splice(0, 1)
		process.stdout.write(new Buffer(frame.data, 'base64').toString('utf-8'))
		await new Promise(y => setTimeout(y, frame.time - last))
		last = frame.time
	}
	process.exit()
}

yargs.usage('$0 [command]')
	.help('help').alias('help', 'h')
	.version('version', require('../package').version).alias('version', 'v')

	.command('rec', 'Record a session', yargs =>
		yargs.usage('$0 rec [file]')
			.demand(1), record)

	.command('play', 'Play a session', yargs =>
		yargs.usage('$0 play [file]')
			.demand(1), play)

	.demand(1)
	.argv
