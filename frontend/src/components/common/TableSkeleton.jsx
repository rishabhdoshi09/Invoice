import { Skeleton, TableCell, TableRow } from '@mui/material';

/**
 * Shimmer placeholder rows shown while a table's data loads.
 * Reads as "your data is arriving" instead of a bare spinner.
 *
 *   <TableBody>
 *     {loading ? <TableSkeleton rows={8} columns={6} /> : ...}
 *   </TableBody>
 */
export const TableSkeleton = ({ rows = 8, columns = 5 }) => (
    <>
        {Array.from({ length: rows }, (_, r) => (
            <TableRow key={r}>
                {Array.from({ length: columns }, (_, c) => (
                    <TableCell key={c}>
                        <Skeleton
                            variant="text"
                            animation="wave"
                            width={`${55 + ((r * 7 + c * 13) % 40)}%`}
                            height={20}
                        />
                    </TableCell>
                ))}
            </TableRow>
        ))}
    </>
);

export default TableSkeleton;
