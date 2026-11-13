// Turns a title into a URL slug: lowercase ASCII words joined by "-".
export function slugify(title) {
	if (typeof title !== 'string') throw new TypeError('title must be a string')
	const slug = title
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	if (slug === '') throw new Error('empty-slug')
	return slug
}
