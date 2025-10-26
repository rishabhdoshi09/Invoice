import { useEffect, useState } from "react";
import { TablePagination } from "@mui/material";

export const Pagination = (props) => {
    const [page, setPage] = useState({
        offset: props.offset ?? 0,
        limit: props.limit ?? 100,
    });

    useEffect(() => {
        if (props.limit !== page.limit || props.offset !== page.offset) {
            props.updateFilters(page.limit, page.offset);
        }
    }, [page]);

    useEffect(() => {
        setPage({
            limit: props.limit,
            offset: props.offset,
        });
    }, [props.limit, props.offset]);

    const handleChangePage = (event, newPage) => {
        setPage((prevState) => {
            return {
                ...prevState,
                offset: newPage,
            };
        });
    };

    const handleChangeRowsPerPage = (event) => {
        setPage({
            limit: +event.target.value,
            offset: 0,
        });
    };

    return (
        <TablePagination
            component="div"
            onPageChange={handleChangePage}
            page={page.offset}
            count={+props.count ?? 0}
            rowsPerPage={page.limit}
            onRowsPerPageChange={handleChangeRowsPerPage}
        />
    );
};
