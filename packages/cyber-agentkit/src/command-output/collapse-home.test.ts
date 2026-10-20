import { sep } from 'node:path'
import { expect, it } from 'vitest'
import { collapseHome } from './collapse-home.js'

it('collapses the home directory out of any path, not only the executable', () => {
	expect(collapseHome(`${sep}home${sep}dev`, `${sep}home${sep}dev${sep}.agents${sep}governances`)).toBe(
		`~${sep}.agents${sep}governances`,
	)
	expect(collapseHome(`${sep}home${sep}dev`, `${sep}etc${sep}governances`)).toBe(`${sep}etc${sep}governances`)
	expect(collapseHome('', `${sep}etc${sep}governances`)).toBe(`${sep}etc${sep}governances`)
})
