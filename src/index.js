import fs from 'fs'
import pty from 'pty.js'
import yargs from 'yargs'

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
	term.on('close', () => {
		const outFile = args._[1]
		console.error('ttycast.js: complete, writing to', args._[1])
		const data = frames.map(f => `${f.time} ${f.data.toString('base64')}`)
			.join('\n')
		fs.writeFile(outFile, data, 'utf-8', err => {
			if (err) throw err
			process.exit()
		})
	})
}

function play(args) {
	const fileName = args._[1]
	fs.readFile(fileName, 'utf-8', (err, data) => {
		if (err) throw err
		const frames = data.split('\n').map(l => {
			const [ time, data ] = l.split(' ')
			return { time, data }
		})

		let last = 0
		function next() {
			if (frames.length == 0)
				process.exit()

			const [ frame ] = frames.splice(0, 1)
			process.stdout.write(new Buffer(frame.data, 'base64').toString('utf-8'))
			// console.log(frame, frame.time - last) //new Buffer(frame.data, 'base64').toString('utf-8'))
			setTimeout(next, frame.time - last)
			last = frame.time
		}
		next()
	})
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
